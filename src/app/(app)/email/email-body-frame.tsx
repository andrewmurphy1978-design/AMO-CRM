"use client";

import { useMemo } from "react";
import { buildEmailSrcDoc } from "@/lib/email-html";

// Renders an email's body inside a sandboxed iframe (sandbox="" — no
// allow-scripts, no allow-same-origin) rather than dangerouslySetInnerHTML
// or a sanitizer library — see the comment in email-html.ts for why. The
// one real cost of that strong a sandbox: an iframe with no scripts can't
// report its own content height back to the page, so this fills whatever
// height its flex parent gives it (see the caller — a flex column with a
// definite height) and scrolls internally, rather than growing to fit its
// content — the caller relies on this being the dialog's *only* scrollbar.
//
// `allowRemoteImages` is controlled by the caller — its own "Show images"
// button lives beside the Linked-to summary in the dialog's header, not
// here (see email-dialog.tsx), so the button and this iframe can sit in
// different parts of the dialog's layout without duplicating state.
export default function EmailBodyFrame({
  html,
  text,
  allowRemoteImages,
}: {
  html: string | null;
  text: string | null;
  allowRemoteImages: boolean;
}) {
  const srcDoc = useMemo(() => buildEmailSrcDoc(html, text, { allowRemoteImages }), [html, text, allowRemoteImages]);

  return (
    <iframe
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      title="Email body"
      className="h-full min-h-0 w-full flex-1 rounded-lg border border-card-border bg-white"
    />
  );
}
