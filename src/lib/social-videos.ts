import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { BufferClient } from "@/lib/buffer";
import { makeClientWith } from "@/lib/automations";
import { MAKE_QUEUE_STORE_ID } from "@/lib/social-weekly";
import { offsetMinutes } from "@/lib/timezones";
import { notifyUsers } from "@/lib/push";

// The weekly Claude task (Part 1) renders the TikTok videos and hands them to the CRM instead of waiting in a chat for
// "schedule the videos". Each video lands here as a SocialVideoApproval; when Andrew approves one, the CRM does what
// Part 2 of the task used to do, for that video:
//   • TikTok (its day, 9:00 AM ET) and the English Instagram Reel through Buffer's API (the CRM's own Buffer keys);
//   • the Facebook Reel, French Instagram Reel, LinkedIn video and YouTube Short through Make's "Social Post Queue"
//     (datastore 108624), posted by the "Social Media Poster" / "YouTube Shorts Poster" scenarios — the day after.

const ZONE = "America/Toronto";
const DAY = 86_400_000;

export const VIDEO_TARGETS = ["tiktok", "instagram-reel", "facebook-reel", "linkedin-video", "youtube-short"] as const;
export type VideoTarget = (typeof VIDEO_TARGETS)[number];

export interface VideoCaptions {
  tiktok: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  youtubeTitle: string;
  youtube: string;
}

export interface VideoResult {
  target: VideoTarget;
  ok: boolean;
  at: string; // when it posts (UTC ISO)
  via: "buffer" | "make";
  id?: string; // Buffer post id or Make record key
  error?: string;
  note?: string; // why a post was kept when the video was unscheduled (already published / uploaded)
  retryRemoval?: boolean; // kept only because removing it failed — Unschedule can try again
}

const BUFFER_CHANNELS = {
  EN: { tiktok: "6a3c38ca5ab6d2f1066a79a0", instagram: "6a3aef4f5ab6d2f106646dfc" },
  FR: { tiktok: "6a3c388d5ab6d2f1066a779a", instagram: "6a3af02a5ab6d2f106647102" },
} as const;

// ET posting times (hour, minute) for each target. TikTok posts on its own day; everything else the day after.
const TIMES: Record<VideoTarget, [number, number]> = {
  tiktok: [9, 0],
  "instagram-reel": [12, 0],
  "facebook-reel": [12, 0],
  "linkedin-video": [13, 0],
  "youtube-short": [15, 0],
};

/** A wall-clock time in Montréal/Toronto (handles EST/EDT) as a UTC Date. */
export function easternToUtc(ymd: string, hour: number, minute = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let utc = guess - offsetMinutes(ZONE, new Date(guess)) * 60_000;
  utc = guess - offsetMinutes(ZONE, new Date(utc)) * 60_000; // settle around a DST switch
  return new Date(utc);
}

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => ymdOf(new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * DAY));
const weekdayKey = (ymd: string) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(`${ymd}T00:00:00Z`).getUTCDay()];

/** ISO week number of a date (the task's "Week XX"). */
function isoWeek(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

function youtubeTitle(raw: string): string {
  let title = raw.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  if (!/#shorts/i.test(title)) title = `${title} #Shorts`;
  if (title.length > 100) title = `${title.replace(/\s*#shorts\s*/i, " ").trim().slice(0, 91).trim()} #Shorts`;
  return title;
}

// ── Hand-off from the Claude task ────────────────────────────────────────────────────────────────────────────────────

export interface HandoffResult {
  received: number;
  skipped: string[]; // slots left untouched because they were already scheduled
  errors: string[];
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Saves the videos the task sends (re-sending a slot — e.g. after a re-render — puts it back to "waiting for approval")
 * and notifies the admins. Body: { type: "video-approval", weekStart, weekNumber?, canvasUrl?, note?, videos: [{ slot,
 * language, tiktokDate, title, mp4Url, audioSeconds?, videoSeconds?, captions: { tiktok, instagram, facebook, linkedin,
 * youtubeTitle, youtube } }] }
 */
export async function receiveVideoHandoff(db: PrismaClient, body: Record<string, unknown>, weekStart: string): Promise<HandoffResult> {
  const result: HandoffResult = { received: 0, skipped: [], errors: [] };
  const weekDate = new Date(`${weekStart}T00:00:00Z`);
  const weekNumber = num(body.weekNumber) ?? isoWeek(weekStart);
  const videos = Array.isArray(body.videos) ? body.videos : [];
  if (videos.length === 0) result.errors.push("videos is empty");

  for (const [i, raw] of videos.slice(0, 20).entries()) {
    const v = (raw ?? {}) as Record<string, unknown>;
    const c = (v.captions ?? {}) as Record<string, unknown>;
    const language = str(v.language).toUpperCase();
    const slot = str(v.slot).toLowerCase();
    const tiktokDate = str(v.tiktokDate);
    const mp4Url = str(v.mp4Url);
    const captions: VideoCaptions = {
      tiktok: str(c.tiktok),
      instagram: str(c.instagram),
      facebook: str(c.facebook),
      linkedin: str(c.linkedin),
      youtubeTitle: str(c.youtubeTitle) || str(v.title),
      youtube: str(c.youtube),
    };
    const problems = [
      !/^[a-z0-9-]{1,40}$/.test(slot) && "slot",
      !["EN", "FR"].includes(language) && "language (EN/FR)",
      !/^\d{4}-\d{2}-\d{2}$/.test(tiktokDate) && "tiktokDate (YYYY-MM-DD)",
      !/^https:\/\//.test(mp4Url) && "mp4Url (https)",
      !str(v.title) && "title",
      ...(Object.entries(captions) as [keyof VideoCaptions, string][]).filter(([, text]) => !text).map(([k]) => `captions.${k}`),
    ].filter(Boolean);
    if (problems.length > 0) {
      result.errors.push(`videos[${i}]${slot ? ` (${slot})` : ""}: missing or invalid ${problems.join(", ")}`);
      continue;
    }

    const existing = await db.socialVideoApproval.findUnique({ where: { weekStart_slot: { weekStart: weekDate, slot } } });
    if (existing && existing.status === "SCHEDULED") {
      result.skipped.push(slot);
      continue;
    }
    const data = {
      weekNumber,
      language,
      title: str(v.title),
      mp4Url,
      tiktokDate: new Date(`${tiktokDate}T00:00:00Z`),
      captions: captions as never,
      audioSeconds: num(v.audioSeconds),
      videoSeconds: num(v.videoSeconds),
      canvasUrl: str(body.canvasUrl) || null,
      note: str(body.note).slice(0, 2000) || null,
    };
    // A re-send replaces the video; results already sent (an ERROR row's successful targets) are kept so they are not posted twice.
    await db.socialVideoApproval.upsert({
      where: { weekStart_slot: { weekStart: weekDate, slot } },
      create: { weekStart: weekDate, slot, ...data },
      update: { ...data, status: "PENDING", feedback: null, decidedAt: null },
    });
    result.received += 1;
  }

  if (result.received > 0) {
    const pending = await db.socialVideoApproval.count({ where: { weekStart: weekDate, status: "PENDING" } });
    await notifyUsers(
      db,
      { to: "admins", category: "social", dedupeKey: `videos:${weekStart}:${Date.now()}`, urgent: true },
      {
        title: `🎬 Week ${weekNumber}: videos to approve`,
        body: `${pending} TikTok video${pending === 1 ? " is" : "s are"} waiting for your approval — nothing posts until you approve.`,
        url: "/social-analytics#videos",
      }
    );
  }
  return result;
}

// ── Scheduling an approved video ─────────────────────────────────────────────────────────────────────────────────────

async function bufferClient(db: PrismaClient, language: string): Promise<BufferClient> {
  const provider = language === "FR" ? "buffer_fr" : "buffer_en";
  const setting = await db.integrationSetting.findUnique({ where: { provider } });
  if (!setting?.apiKeyEncrypted) throw new Error(`The ${language} Buffer API key is not saved in Settings → Integrations`);
  return new BufferClient(await decryptSecret(setting.apiKeyEncrypted));
}

/**
 * The TikTok day to use: the planned one, or — when its 9:00 AM ET has passed — the next day that has no other TikTok in
 * the same language (as the task's own Part 2 did).
 */
async function pickTiktokDay(db: PrismaClient, video: { id: string; weekStart: Date; language: string; tiktokDate: Date }): Promise<string> {
  const others = await db.socialVideoApproval.findMany({
    where: { weekStart: video.weekStart, language: video.language, id: { not: video.id }, status: { not: "CHANGES" } },
    select: { tiktokDate: true, scheduledDate: true },
  });
  const taken = new Set(others.map((o) => ymdOf(o.scheduledDate ?? o.tiktokDate)));
  const soon = Date.now() + 10 * 60_000;
  let day = ymdOf(video.tiktokDate);
  for (let i = 0; i < 14 && (easternToUtc(day, 9).getTime() <= soon || taken.has(day)); i++) day = addDays(day, 1);
  return day;
}

/**
 * Schedules one approved video everywhere it goes. Safe to run again after an error: targets that already succeeded are
 * skipped, so nothing is posted twice.
 */
export async function scheduleApprovedVideo(db: PrismaClient, id: string): Promise<{ status: string; results: VideoResult[]; movedTo: string | null }> {
  const video = await db.socialVideoApproval.findUniqueOrThrow({ where: { id } });
  const previous = ((video.results as VideoResult[] | null) ?? []).filter((r) => r.ok);
  if (video.status === "SCHEDULED") return { status: video.status, results: previous, movedTo: null };

  const done = new Map(previous.map((r) => [r.target, r]));
  const day = done.has("tiktok") && video.scheduledDate ? ymdOf(video.scheduledDate) : await pickTiktokDay(db, video);
  const next = addDays(day, 1);
  const lang = video.language === "FR" ? "FR" : "EN";
  const lower = lang.toLowerCase();
  const captions = video.captions as unknown as VideoCaptions;
  const week = `w${video.weekNumber ?? isoWeek(ymdOf(video.weekStart))}`;
  const nextKey = weekdayKey(next);

  let buffer: BufferClient | null = null;
  const getBuffer = async () => (buffer ??= await bufferClient(db, lang));
  let make: Awaited<ReturnType<typeof makeClientWith>> | undefined;
  const getMake = async () => {
    if (make === undefined) make = await makeClientWith(db);
    if (!make) throw new Error("Make is not connected in Settings → Integrations");
    return make;
  };
  const queue = async (key: string, record: Record<string, unknown>) => {
    await (await getMake()).createDataStoreRecord(MAKE_QUEUE_STORE_ID, key, record);
    return key;
  };

  const results: VideoResult[] = [];
  for (const target of VIDEO_TARGETS) {
    if (done.has(target)) {
      results.push(done.get(target)!);
      continue;
    }
    const [h, m] = TIMES[target];
    const at = easternToUtc(target === "tiktok" ? day : next, h, m).toISOString();
    const viaBuffer = target === "tiktok" || (target === "instagram-reel" && lang === "EN");
    try {
      let postId: string;
      if (target === "tiktok") {
        postId = await (await getBuffer()).createPost({
          text: captions.tiktok,
          channelId: BUFFER_CHANNELS[lang].tiktok,
          schedulingType: "automatic",
          mode: "customScheduled",
          dueAt: at,
          needsApproval: false,
          assets: [{ video: { url: video.mp4Url } }],
          metadata: { tiktok: { title: video.title.slice(0, 90) } },
        });
      } else if (target === "instagram-reel" && lang === "EN") {
        postId = await (await getBuffer()).createPost({
          text: captions.instagram,
          channelId: BUFFER_CHANNELS.EN.instagram,
          schedulingType: "automatic",
          mode: "customScheduled",
          dueAt: at,
          needsApproval: false,
          assets: [{ video: { url: video.mp4Url } }],
          metadata: { instagram: { type: "reel", shouldShareToFeed: true } },
        });
      } else if (target === "instagram-reel") {
        postId = await queue(`${week}-reel-ig-${nextKey}-fr`, { platform: "instagram-reel", language: "fr", message: captions.instagram, media_url: video.mp4Url, scheduled_time: at });
      } else if (target === "facebook-reel") {
        postId = await queue(`${week}-reel-fb-${nextKey}-${lower}`, { platform: "facebook-reel", language: lower, message: captions.facebook, media_url: video.mp4Url, scheduled_time: at });
      } else if (target === "linkedin-video") {
        postId = await queue(`${week}-vid-li-${nextKey}-${lower}`, { platform: "linkedin-video", language: lower, message: captions.linkedin, media_url: video.mp4Url, scheduled_time: at });
      } else {
        postId = await queue(`${week}-yt-${nextKey}-${lower}`, {
          platform: "youtube-short",
          language: lower,
          title: youtubeTitle(captions.youtubeTitle),
          message: captions.youtube,
          media_url: video.mp4Url,
          scheduled_time: at,
        });
      }
      results.push({ target, ok: true, at, via: viaBuffer ? "buffer" : "make", id: postId });
    } catch (e) {
      results.push({ target, ok: false, at, via: viaBuffer ? "buffer" : "make", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
    }
  }

  const status = results.every((r) => r.ok) ? "SCHEDULED" : "ERROR";
  await db.socialVideoApproval.update({
    where: { id },
    data: { status, results: results as never, scheduledDate: new Date(`${day}T00:00:00Z`), decidedAt: new Date(), feedback: null },
  });
  await reportWeekIfDone(db, video.weekStart);
  return { status, results, movedTo: day !== ymdOf(video.tiktokDate) ? day : null };
}

/** What the Social Media page shows: everything still waiting, needing changes or partly failed, plus the last 3 days' decisions. */
export function listVideoApprovals(db: PrismaClient) {
  return db.socialVideoApproval.findMany({
    where: { OR: [{ status: { in: ["PENDING", "CHANGES", "ERROR"] } }, { decidedAt: { gte: new Date(Date.now() - 3 * DAY) } }] },
    orderBy: [{ weekStart: "desc" }, { tiktokDate: "asc" }, { language: "asc" }],
    take: 24,
  });
}

/**
 * Takes an approved video back: deletes its Buffer posts and its records in Make's queue, and puts it back to "waiting
 * for approval". What already went out (its time has passed, or a YouTube Short the poster already uploaded) cannot be
 * pulled back from here — those stay in the results with a note saying where to remove them, and are not posted again
 * if the video is re-approved.
 */
export async function unscheduleVideo(db: PrismaClient, id: string): Promise<{ removed: VideoTarget[]; kept: VideoResult[] }> {
  const video = await db.socialVideoApproval.findUniqueOrThrow({ where: { id } });
  const results = ((video.results as VideoResult[] | null) ?? [])
    .filter((r) => r.ok && r.id)
    .filter((r) => !r.note || r.retryRemoval)
    .map((r) => ({ ...r, note: undefined, retryRemoval: undefined }));
  const alreadyKept = ((video.results as VideoResult[] | null) ?? []).filter((r) => r.ok && r.note && !r.retryRemoval);
  const lang = video.language === "FR" ? "FR" : "EN";
  const soon = Date.now() + 2 * 60_000;
  const removed: VideoTarget[] = [];
  const kept: VideoResult[] = [...alreadyKept];

  const make = results.some((r) => r.via === "make") ? await makeClientWith(db) : null;
  const queued = make ? new Set((await make.listDataStoreRecords(MAKE_QUEUE_STORE_ID)).map((r) => r.key)) : new Set<string>();
  let buffer: BufferClient | null = null;

  for (const r of results) {
    const where = r.target === "youtube-short" ? "YouTube Studio" : r.target === "tiktok" ? "TikTok" : r.target.split("-")[0].replace(/^./, (c) => c.toUpperCase());
    if (new Date(r.at).getTime() <= soon) {
      kept.push({ ...r, note: `Already published — remove it in ${where} if needed.` });
      continue;
    }
    try {
      if (r.via === "buffer") {
        buffer ??= await bufferClient(db, lang);
        await buffer.deletePost(r.id!);
        removed.push(r.target);
      } else if (!make) {
        kept.push({ ...r, note: "Make is not connected in Settings, so it could not be removed.", retryRemoval: true });
      } else if (!queued.has(r.id!)) {
        kept.push({
          ...r,
          note: r.target === "youtube-short" ? "Already uploaded to YouTube (private, scheduled) — delete it in YouTube Studio." : `No longer in Make's queue (posted or failed) — check ${where}.`,
        });
      } else {
        await make.deleteDataStoreRecords(MAKE_QUEUE_STORE_ID, [r.id!]);
        removed.push(r.target);
      }
    } catch (e) {
      kept.push({ ...r, note: `Could not be removed: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`, retryRemoval: true });
    }
  }

  const tiktokKept = kept.some((r) => r.target === "tiktok");
  await db.socialVideoApproval.update({
    where: { id },
    data: { status: "PENDING", results: kept as never, scheduledDate: tiktokKept ? video.scheduledDate : null, decidedAt: null },
  });
  // The CRM's merged report for the week no longer matches; the task's own report shows again until the next approval.
  await db.socialWeeklyRun.deleteMany({ where: { weekStart: video.weekStart, source: "crm" } });
  return { removed, kept };
}

/** Andrew wants something fixed before it goes out; the task re-renders and re-sends the video. */
export async function requestVideoChanges(db: PrismaClient, id: string, feedback: string): Promise<void> {
  const video = await db.socialVideoApproval.findUniqueOrThrow({ where: { id } });
  if (video.status === "SCHEDULED") throw new Error("This video is already scheduled.");
  await db.socialVideoApproval.update({ where: { id }, data: { status: "CHANGES", feedback: feedback.trim().slice(0, 2000) || null, decidedAt: new Date() } });
}

// ── The week's report ────────────────────────────────────────────────────────────────────────────────────────────────

type ReportPost = { platform: string; language: string | null; count: number; via: string | null };
const PLATFORM_OF: Record<VideoTarget, string> = {
  tiktok: "tiktok",
  "instagram-reel": "instagram",
  "facebook-reel": "facebook",
  "linkedin-video": "linkedin",
  "youtube-short": "youtube",
};

/**
 * Once no video of the week is waiting any more, adds the videos to the week's report (the Social Media → Posts weekly
 * check reads the latest one): the task's own Part 1 report plus what the CRM scheduled, with any failure as an error.
 */
async function reportWeekIfDone(db: PrismaClient, weekStart: Date): Promise<void> {
  const videos = await db.socialVideoApproval.findMany({ where: { weekStart } });
  if (videos.some((v) => v.status === "PENDING")) return;

  const base = await db.socialWeeklyRun.findFirst({ where: { weekStart, source: "claude" }, orderBy: { reportedAt: "desc" } });
  const posts = new Map<string, ReportPost>();
  for (const p of ((base?.posts as ReportPost[] | null) ?? [])) posts.set(`${p.platform}|${p.language}`, { ...p });
  const errors = [...(((base?.errors as string[] | null) ?? []).map(String))];

  for (const v of videos) {
    if (v.status === "CHANGES") {
      errors.push(`${v.slot} (${v.language}) — changes requested, not scheduled${v.feedback ? `: ${v.feedback.slice(0, 120)}` : ""}`);
      continue;
    }
    for (const r of (v.results as VideoResult[] | null) ?? []) {
      if (!r.ok) {
        errors.push(`${v.slot} ${r.target}: ${r.error ?? "failed"}`.slice(0, 300));
        continue;
      }
      const key = `${PLATFORM_OF[r.target]}|${v.language}`;
      const p = posts.get(key);
      if (p) {
        p.count += 1;
        p.via = p.via && p.via !== r.via ? "both" : r.via;
      } else posts.set(key, { platform: PLATFORM_OF[r.target], language: v.language, count: 1, via: r.via });
    }
  }

  const scheduled = videos.filter((v) => v.status === "SCHEDULED").length;
  const note = [base?.note, `CRM: ${scheduled}/${videos.length} video(s) approved and scheduled (TikTok + Reels, LinkedIn, YouTube).`].filter(Boolean).join("\n").slice(0, 2000);
  await db.socialWeeklyRun.create({
    data: { weekStart, source: "crm", status: errors.length > 0 ? "error" : "success", posts: [...posts.values()] as never, errors: errors.slice(0, 20) as never, note },
  });
}
