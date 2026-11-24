"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/section-card";
import { approveSocialVideo, requestSocialVideoChanges } from "@/actions/social-videos";
import type { VideoCaptions, VideoResult } from "@/lib/social-videos";
import type { getDict } from "@/lib/i18n/dictionaries";

export interface ApprovalVideo {
  id: string;
  weekNumber: number | null;
  language: string;
  title: string;
  mp4Url: string;
  tiktokDate: string;
  scheduledDate: string | null;
  captions: VideoCaptions;
  audioSeconds: number | null;
  videoSeconds: number | null;
  canvasUrl: string | null;
  status: string;
  feedback: string | null;
  results: VideoResult[];
}

type T = ReturnType<typeof getDict>["videoApprovals"];

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  CHANGES: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  SCHEDULED: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  ERROR: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function fmtDay(ymd: string, lang: "en" | "fr") {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtAt(iso: string, lang: "en" | "fr") {
  return new Date(iso).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });
}

function VideoCard({ v, lang, t, busy, onApprove }: { v: ApprovalVideo; lang: "en" | "fr"; t: T; busy: boolean; onApprove: (id: string) => Promise<void> }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState(v.feedback ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const day = v.scheduledDate ?? v.tiktokDate;
  const moved = v.scheduledDate && v.scheduledDate !== v.tiktokDate;
  const canApprove = v.status === "PENDING" || v.status === "CHANGES" || v.status === "ERROR";

  const saveChanges = () =>
    startSaving(async () => {
      const res = await requestSocialVideoChanges(v.id, feedback);
      if ("error" in res) setError(res.error);
      else {
        setEditing(false);
        setError(null);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-card-border bg-card-bg p-3">
      <video src={v.mp4Url} controls preload="metadata" playsInline className="aspect-[9/16] max-h-[420px] w-full rounded-lg bg-black object-contain" />
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded bg-amo-teal/15 px-1.5 py-0.5 text-[10px] font-bold text-ink">{v.language}</span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{v.title}</span>
      </div>
      <div className="text-xs text-soft">
        <div>{t.tiktokOn.replace("{date}", fmtDay(day, lang))}</div>
        <div>{t.thenNextDay}</div>
        {v.audioSeconds != null && v.videoSeconds != null && (
          <div>{t.durations.replace("{audio}", v.audioSeconds.toFixed(1)).replace("{video}", v.videoSeconds.toFixed(1))}</div>
        )}
        {moved && <div className="text-amber-600 dark:text-amber-400">{t.movedTo.replace("{date}", fmtDay(day, lang))}</div>}
      </div>
      <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[v.status] ?? ""}`}>{t.status[v.status] ?? v.status}</span>

      {v.status === "CHANGES" && (
        <div className="rounded-lg bg-sky-500/10 p-2 text-xs text-ink">
          {v.feedback && <p className="mb-1 font-medium">“{v.feedback}”</p>}
          <p className="text-soft">{t.changesNote}</p>
        </div>
      )}

      {v.results.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {v.results.map((r) => (
            <li key={r.target} className="flex items-start gap-1.5">
              <span className={r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>{r.ok ? "✓" : "✕"}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink">{t.targets[r.target] ?? r.target}</span>
                <span className="text-soft"> · {fmtAt(r.at, lang)}</span>
                {!r.ok && r.error && <span className="block break-words text-red-600 dark:text-red-400">{r.error}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer font-medium text-soft hover:text-ink">{t.captions}</summary>
        <dl className="mt-1 space-y-1.5">
          {Object.entries(v.captions).map(([k, text]) => (
            <div key={k}>
              <dt className="font-semibold text-ink">{t.captionLabels[k] ?? k}</dt>
              <dd className="whitespace-pre-wrap break-words text-soft">{text}</dd>
            </div>
          ))}
        </dl>
      </details>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            placeholder={t.changesPlaceholder}
            className="w-full rounded-lg border border-card-border bg-transparent p-2 text-sm text-ink"
          />
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={saveChanges} className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold">
              {t.saveChanges}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-card-border px-3 py-1.5 text-sm text-soft hover:text-ink">
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        canApprove && (
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <button type="button" disabled={busy} onClick={() => onApprove(v.id)} className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60">
              {busy ? t.scheduling : v.status === "ERROR" ? t.retry : v.status === "CHANGES" ? t.reopen : t.approve}
            </button>
            {v.status !== "ERROR" && (
              <button type="button" disabled={busy} onClick={() => setEditing(true)} className="rounded-lg border border-card-border px-3 py-1.5 text-sm text-soft hover:text-ink">
                {t.requestChanges}
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default function VideoApprovalsList({ videos, lang, t }: { videos: ApprovalVideo[]; lang: "en" | "fr"; t: T }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const pending = videos.filter((v) => v.status === "PENDING");
  const weeks = [...new Set(videos.map((v) => v.weekNumber).filter((n): n is number => n != null))];
  const canvasUrl = videos.find((v) => v.canvasUrl)?.canvasUrl ?? null;

  // One video per request: each approval makes several Buffer/Make calls, and doing them one at a time keeps every
  // request well inside the Worker's limits.
  const approve = async (ids: string[]) => {
    setError(null);
    setBusy(new Set(ids));
    for (const id of ids) {
      const res = await approveSocialVideo(id);
      if ("error" in res) setError(res.error);
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    router.refresh();
  };

  return (
    <div id="videos" className="scroll-mt-20">
      <Card
        color="mockups"
        title={
          <>
            🎬 {t.title}
            {weeks.length > 0 && <span className="font-normal normal-case opacity-90">· {weeks.map((n) => t.week.replace("{n}", String(n))).join(", ")}</span>}
          </>
        }
        actions={
          pending.length > 1 ? (
            <button
              type="button"
              disabled={busy.size > 0}
              onClick={() => approve(pending.map((v) => v.id))}
              className="rounded-md bg-white/20 px-2 py-1 text-xs font-semibold normal-case text-white hover:bg-white/30 disabled:opacity-60"
            >
              {busy.size > 0 ? t.scheduling : t.approveAll.replace("{n}", String(pending.length))}
            </button>
          ) : undefined
        }
      >
        <p className="text-sm text-soft">
          {t.subtitle}
          {canvasUrl && (
            <>
              {" "}
              <a href={canvasUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-amo-teal underline">
                {t.canvas}
              </a>
            </>
          )}
        </p>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {videos.map((v) => (
            <VideoCard key={v.id} v={v} lang={lang} t={t} busy={busy.has(v.id)} onApprove={(id) => approve([id])} />
          ))}
        </div>
      </Card>
    </div>
  );
}
