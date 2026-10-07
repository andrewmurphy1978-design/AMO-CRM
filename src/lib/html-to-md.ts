// Some AIs hand back an HTML page instead of the Markdown report that was asked for. This turns it into
// Markdown text (headings, lists, tables, paragraphs) so the CRM can read it like any other report.
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: "..." };

export function htmlToMarkdown(html: string): string {
  let s = html.replace(/<(script|style|head|svg|noscript)[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, t: string) => `\n\n${"#".repeat(Number(n))} ${t}\n\n`);
  // tables: one Markdown row per <tr>
  s = s.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_m, row: string) => {
    const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/\|/g, "/").trim());
    return cells.length ? `\n| ${cells.join(" | ")} |${/<th[\s>]/i.test(row) ? `\n|${cells.map(() => "---").join("|")}|` : ""}` : "";
  });
  s = s.replace(/<li[^>]*>/gi, "\n- ").replace(/<\/(p|div|section|article|ul|ol|table|blockquote)>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, t: string) => `${t.replace(/<[^>]+>/g, "")} (${href})`);
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
