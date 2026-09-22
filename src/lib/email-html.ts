// Builds the sandboxed srcDoc rendered inside the Email Dialog's body
// frame (src/app/(app)/email/email-body-frame.tsx). Deliberately NOT a
// sanitizer — no such library exists in this app yet, and adding one means
// trusting a maintained allowlist. Instead the browser's own <iframe
// sandbox=""> does the isolation: no allow-scripts, no allow-same-origin,
// so nothing this function emits can execute or reach the parent page,
// which makes hand-sanitizing the HTML unnecessary.

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildEmailSrcDoc(html: string | null, text: string | null, opts: { allowRemoteImages: boolean }): string {
  const imgSrc = opts.allowRemoteImages ? "data: https: http:" : "data:";
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc};`;
  const body = html
    ? html
    : `<pre style="white-space:pre-wrap;word-break:break-word;margin:0">${escapeHtml(text ?? "")}</pre>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  html, body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; color: #1f2937; word-break: break-word; }
  img { max-width: 100%; height: auto; }
  a { color: #047857; }
  table { max-width: 100%; }
</style>
</head>
<body>${body}</body>
</html>`;
}
