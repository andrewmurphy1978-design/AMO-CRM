"use client";

import { useMemo, useState } from "react";
import { buildEmailSrcDoc } from "@/lib/email-html";

// Renders an email's body inside a sandboxed iframe (sandbox="" — no
// allow-scripts, no allow-same-origin) rather than dangerouslySetInnerHTML
// or a sanitizer library — see the comment in email-html.ts for why. The
// one real cost of that strong a sandbox: an iframe with no scripts can't
// report its own content height back to the page, so this gets a fixed
// viewport with internal scrolling instead of growing to fit its content.
export default function EmailBodyFrame({
  html,
  text,
  showRemoteImagesLabel,
}: {
  html: string | null;
  text: string | null;
  showRemoteImagesLabel: string;
}) {
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const hasRemoteImages = useMemo(() => (html ? /<img[^>]+src=["']https?:/i.test(html) : false), [html]);
  const srcDoc = useMemo(() => buildEmailSrcDoc(html, text, { allowRemoteImages }), [html, text, allowRemoteImages]);

  return (
    <div className="flex flex-col gap-2">
      {hasRemoteImages && !allowRemoteImages && (
        <button
          type="button"
          onClick={() => setAllowRemoteImages(true)}
          className="self-start rounded-md border border-card-border px-2 py-1 text-xs font-medium text-soft hover:bg-black/5"
        >
          {showRemoteImagesLabel}
        </button>
      )}
      <iframe
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        title="Email body"
        className="h-[55vh] w-full rounded-lg border border-card-border bg-white"
      />
    </div>
  );
}
