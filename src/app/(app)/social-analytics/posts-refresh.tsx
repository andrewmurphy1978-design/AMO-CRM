"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshSocialPostsAction, inspectBufferSchemaAction, inspectBufferPostsAction } from "@/actions/social-posts";

// Refreshes the cached posts from Buffer (automatically when they are stale, or on the button) and, for admins,
// shows what Buffer's live API offers.
export default function PostsRefresh({ latestFetch, isAdmin, lang }: { latestFetch: number; isAdmin: boolean; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const router = useRouter();
  const [busy, start] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const [info, setInfo] = useState("");
  const [channels, setChannels] = useState<{ name: string; platform: string; language: string; sent: number; queued: number; error?: string }[]>([]);
  const [schema, setSchema] = useState("");
  const started = useRef(false);

  const refresh = () =>
    start(async () => {
      setInfo("");
      try {
        const r = await refreshSocialPostsAction();
        setErrors(r.errors);
        setChannels(r.channels);
        setInfo(fr ? `${r.saved} publication(s) mise(s) à jour.` : `${r.saved} post(s) updated.`);
        router.refresh();
      } catch (e) {
        setErrors([e instanceof Error ? e.message : String(e)]);
      }
    });

  useEffect(() => {
    // Older than 15 minutes (or never fetched): refresh once on opening the tab.
    if (Date.now() - latestFetch > 15 * 60 * 1000 && !started.current) {
      started.current = true;
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-readonly-ok disabled={busy} onClick={refresh} className="rounded-lg border border-card-border bg-card-bg px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60">
          {busy ? (fr ? "Mise à jour…" : "Updating…") : fr ? "Actualiser depuis Buffer" : "Refresh from Buffer"}
        </button>
        {info && <span className="text-xs text-soft">{info}</span>}
        {isAdmin && (
          <button
            type="button"
            data-readonly-ok
            disabled={busy}
            onClick={() => start(async () => { const r = await inspectBufferSchemaAction(); setSchema("error" in r ? r.error : r.text); })}
            className="rounded-lg border border-card-border bg-card-bg px-3 py-1.5 text-sm text-soft hover:bg-black/5 disabled:opacity-60"
          >
            {fr ? "Vérifier les champs de l'API Buffer" : "Check Buffer API fields"}
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            data-readonly-ok
            disabled={busy}
            onClick={() => start(async () => { const r = await inspectBufferPostsAction(); setSchema("error" in r ? r.error : r.text); })}
            className="rounded-lg border border-card-border bg-card-bg px-3 py-1.5 text-sm text-soft hover:bg-black/5 disabled:opacity-60"
          >
            {fr ? "Vérifier les publications reçues de Buffer" : "Check posts returned by Buffer"}
          </button>
        )}
      </div>
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {errors.map((e, i) => <li key={i} className="break-words">{e}</li>)}
        </ul>
      )}
      {channels.length > 0 && (
        <details className="rounded-lg border border-card-border bg-card-bg p-3 text-xs text-ink">
          <summary className="cursor-pointer font-medium">{fr ? "Canaux lus dans Buffer" : "Channels read from Buffer"}</summary>
          <ul className="mt-2 space-y-1">
            {channels.map((c, i) => (
              <li key={i} className={c.error || (c.sent + c.queued === 0) ? "text-amber-700" : ""}>
                {c.name} ({c.platform} {c.language}): {c.sent} {fr ? "publiées" : "sent"}, {c.queued} {fr ? "en file" : "queued"}
                {c.error ? ` — ${c.error}` : c.sent + c.queued === 0 ? (fr ? " — Buffer n'a retourné aucune publication pour ce canal" : " — Buffer returned no posts for this channel") : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {schema && <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-card-border bg-field-bg p-3 text-xs text-ink">{schema}</pre>}
    </div>
  );
}
