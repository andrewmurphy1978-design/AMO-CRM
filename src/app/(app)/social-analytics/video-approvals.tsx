import { withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import { listVideoApprovals, type VideoCaptions, type VideoResult } from "@/lib/social-videos";
import VideoApprovalsList, { type ApprovalVideo } from "./video-approvals-list";

// The TikTok videos the weekly Claude task handed over for approval (see src/lib/social-videos.ts). Shows everything still
// waiting, needing changes or partly failed, plus what was scheduled in the last 3 days; nothing at all otherwise.
export default async function VideoApprovals({ lang }: { lang: "en" | "fr" }) {
  const rows = await withScopedPrismaClient((db) => listVideoApprovals(db));
  if (rows.length === 0) return null;

  const videos: ApprovalVideo[] = rows.map((r) => ({
    id: r.id,
    weekNumber: r.weekNumber,
    language: r.language,
    title: r.title,
    mp4Url: r.mp4Url,
    tiktokDate: r.tiktokDate.toISOString().slice(0, 10),
    scheduledDate: r.scheduledDate ? r.scheduledDate.toISOString().slice(0, 10) : null,
    captions: r.captions as unknown as VideoCaptions,
    audioSeconds: r.audioSeconds,
    videoSeconds: r.videoSeconds,
    canvasUrl: r.canvasUrl,
    status: r.status,
    feedback: r.feedback,
    results: (r.results as VideoResult[] | null) ?? [],
  }));
  return <VideoApprovalsList videos={videos} lang={lang} t={getDict(lang).videoApprovals} />;
}
