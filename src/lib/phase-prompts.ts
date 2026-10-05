// Ready-to-paste AI prompts for the first task of a phase: the research / brand / mock-up
// reports and the builds (website, funnel, blog, newsletter template) in HTML / CSS / JS.

export type PhaseKind = "research" | "brand" | "mockup" | "build-website" | "build-funnel" | "build-blog" | "write-blog" | "build-newsletter";

export interface PromptContext {
  clientName: string;
  company: string;
  industry: string;
  website: string;
  clientLanguage: "en" | "fr";
  clientNotes: string; // the "Contact details for AI"
  projectName: string;
  projectDescription: string;
  projectNotes: string;
  phaseName: string;
  tasks: string[];
  types: { label: string; details: string[] }[];
  languages: string[];
  pages: string[];
  forms: string[];
  funnels: string[];
  topics: string[];
  brandWanted: string[]; // what the brand should include
  brandExisting: string[]; // lines from the client's Brand card
}

// Which prompt (if any) a phase gets, from the phase name and the project type it belongs to.
export function phaseKind(baseName: string, type: string): PhaseKind | null {
  const n = baseName.trim().toLowerCase();
  if (n === "research") return "research";
  if (n === "brand") return "brand";
  if (n === "mock-up" || n === "mockup") return "mockup";
  if (type === "WEBSITE" && /building pages/.test(n)) return "build-website";
  if (type === "FUNNEL" && /building funnels/.test(n)) return "build-funnel";
  if (type === "BLOG" && /blog setup/.test(n)) return "build-blog";
  if (type === "BLOG" && n === "writing") return "write-blog";
  if (type === "NEWSLETTER" && n === "template") return "build-newsletter";
  return null;
}

const list = (items: string[], empty = "(not specified)") => (items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : empty);

function contextBlock(c: PromptContext): string {
  return [
    "## Client and project",
    `- Client: ${c.clientName}${c.company ? ` (${c.company})` : ""}`,
    c.industry ? `- Industry: ${c.industry}` : "",
    c.website ? `- Current website: ${c.website}` : "",
    `- Project: ${c.projectName}`,
    c.projectDescription ? `- Description: ${c.projectDescription}` : "",
    c.languages.length ? `- Languages: ${c.languages.join(", ")}` : `- Language: ${c.clientLanguage === "fr" ? "French" : "English"}`,
    c.types.length ? `- Type(s) of work: ${c.types.map((t) => t.label).join(", ")}` : "",
    "",
    ...c.types.flatMap((t) => (t.details.length ? [`### ${t.label} — details`, ...t.details.map((d) => `- ${d}`), ""] : [])),
    c.clientNotes ? `## What I know about the client\n${c.clientNotes}\n` : "",
    c.projectNotes ? `## Project notes\n${c.projectNotes}\n` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const brandBlock = (c: PromptContext) =>
  c.brandExisting.length > 0 ? `## The client's brand (use it exactly; do not invent a different one)\n${c.brandExisting.join("\n")}\n` : "## Brand\nNo brand elements are recorded yet: propose a coherent, modern palette and font pairing and state them as CSS variables.\n";

const lang = (c: PromptContext) => (c.languages.length ? c.languages.join(" and ") : c.clientLanguage === "fr" ? "French" : "English");

export function buildPhasePrompt(kind: PhaseKind, c: PromptContext): string {
  const intro = `You are working on the "${c.phaseName}" phase of a client project. Tasks of this phase:\n${list(c.tasks)}\n`;
  const ctx = contextBlock(c);
  switch (kind) {
    case "research":
      return `${intro}
You are a senior market and competitor researcher. Produce the RESEARCH REPORT for this project.

${ctx}
## Deliver
A structured report in ${lang(c)} with these sections:
1. Executive summary (5 bullets)
2. The client's offer and positioning today
3. Competitor landscape: 6-10 direct and indirect competitors, as a table (name, URL, offer, pricing, positioning, strengths, weaknesses, tech/SEO notes)
4. Audience and search intent (who searches, what they ask, what they compare)
5. Design and UX patterns seen on the best competitors (what to screenshot: pages, sections, calls to action)
6. Gaps and differentiators the client can own
7. Recommendations for this project (${c.types.map((t) => t.label).join(", ") || "the project"}): structure, messaging, features, pricing cues
8. Risks and open questions to confirm with the client

## Rules
- Cite a source URL for every factual claim; mark anything you could not verify as "unverified".
- Do not invent competitors, prices or statistics.
- Finish with a short list of screenshots to take (competitor + page) for the client presentation.`;
    case "brand":
      return `${intro}
You are a brand designer. Create the BRAND for this client and write it up as a brand report the client can approve.

${ctx}
${brandBlock(c)}
## The brand must include
${list(c.brandWanted, "- logos, colour palette, fonts, brand voice and a brand guide")}

## Deliver (in ${lang(c)}), one section per item above
- Logos: 3 concepts described in words, then the best one as clean inline SVG (main, horizontal, icon-only; light and dark versions)
- Colours: primary, secondary, accent, neutrals with HEX/RGB, usage rules and WCAG AA contrast checks
- Fonts: heading + body pairing (free Google Fonts), sizes and line-height scale
- Icons: style rules and 6 sample icons as inline SVG
- Components: buttons, forms, cards, navigation as CSS using CSS variables
- Graphics and patterns, photo style, chart style: short rules with examples
- Voice and tone: 5 attributes, do/don't list, 3 sample sentences
- Brand guide: the table of contents of a one-page-per-topic PDF guide
Finish with a "Brand card entries" list (category | label | value) that I can paste into the CRM, e.g. "Colour | Primary | #0F766E".`;
    case "mockup":
      return `${intro}
You are a senior UX/UI designer. Produce the MOCK-UP REPORT (design brief the client approves before building).

${ctx}
${brandBlock(c)}
## Deliver (in ${lang(c)})
1. Sitemap / screen list${c.pages.length ? ` (pages requested: ${c.pages.join(", ")})` : ""}${c.funnels.length ? ` (funnels: ${c.funnels.join(", ")})` : ""}
2. For each page or screen: goal, sections in order (hero, benefits, proof, calls to action, footer), the copy outline, and a text wireframe
3. Forms: fields, validation, thank-you behaviour${c.forms.length ? ` (${c.forms.join(", ")})` : ""}
4. Design tokens from the brand (colours, fonts, spacing, radius) as CSS variables
5. Responsive behaviour: mobile, tablet, desktop
6. Interaction and animation notes, accessibility notes (WCAG AA)
7. A checklist the client can tick to approve the mock-up
Keep it concrete enough that a developer can build from it without questions.`;
    case "build-website":
      return `${intro}
You are a senior front-end developer. BUILD THE WEBSITE as static, production-ready files.

${ctx}
${brandBlock(c)}
## Pages${c.pages.length ? `\n${list(c.pages)}` : "\n- Home, Services, About, Contact"}
${c.forms.length ? `## Forms\n${list(c.forms)}\n` : ""}
## Requirements
- Output every file in its own fenced code block, preceded by its path (index.html, assets/css/styles.css, assets/js/main.js, ...)
- Semantic HTML5, mobile-first responsive CSS using CSS variables for the brand tokens, vanilla JavaScript only (no framework, no build step)
- Languages: ${lang(c)}${c.languages.length > 1 ? " — one folder per language (/en/, /fr/), hreflang links and a language switcher" : ""}
- Accessible (WCAG AA): alt text, labels, focus states, contrast, skip link
- SEO: title, meta description, Open Graph, structured data (Organization), clean headings
- Forms post to a placeholder endpoint I can replace; validate client-side; show a friendly success message
- Fast: no heavy libraries, lazy-load images, inline critical CSS if useful
- Real, on-brand copy written for this client (no lorem ipsum)
End with a short deployment note and anything I must supply (logo files, images, form endpoint).`;
    case "build-funnel":
      return `${intro}
You are a conversion-focused front-end developer. BUILD THE FUNNEL PAGES as self-contained HTML/CSS/JS.

${ctx}
${brandBlock(c)}
## Funnels to build
${list(c.funnels, "- Lead funnel (opt-in + thank-you)")}

## Requirements
- For each funnel list its pages in order (e.g. Lead: opt-in, thank-you; Call/Meeting: application, booking, confirmation; Sales: sales page, order form, upsell, thank-you; Webinar: registration, confirmation, replay; Bridge: bridge page) and build each page
- One fenced code block per page, each a single self-contained HTML file with inline <style> and <script> so it can be pasted into a "Custom HTML" element of ClickFunnels / Systeme.io
- Mobile-first, brand CSS variables, one clear call to action per screen, social proof and urgency used honestly
- Languages: ${lang(c)}
- Forms: the fields named in the brief, client-side validation, hidden fields for UTM parameters, placeholder action URL
- Accessible and fast; no external libraries except the brand fonts
- Write the real copy (headline, subheadline, bullets, objections, CTA) in the client's voice
End with the tracking events I should add (page view, form submit, purchase).`;
    case "build-blog":
      return `${intro}
You are a front-end developer. BUILD THE BLOG TEMPLATE as static HTML/CSS/JS.

${ctx}
${brandBlock(c)}
## Requirements
- Files: home / latest posts, article layout, category page, about the author, search box (client-side), newsletter opt-in form
- Output every file in its own fenced code block with its path (index.html, post.html, category.html, assets/css/styles.css, assets/js/main.js)
- Semantic HTML5, mobile-first CSS with the brand CSS variables, vanilla JS, WCAG AA
- Reading experience: comfortable measure, table of contents on long posts, reading time, share links, related posts
- SEO: title/meta/Open Graph, Article structured data, breadcrumbs
- Languages: ${lang(c)}${c.topics.length ? `\n- Categories: ${c.topics.join(", ")}` : ""}
Write a realistic sample post in the layout so I can see the final look.`;
    case "write-blog":
      return `${intro}
You are an SEO content writer. WRITE THE BLOG ARTICLES for this client.

${ctx}
${c.topics.length ? `## Topics\n${list(c.topics)}\n` : ""}
## Deliver (in ${lang(c)})
For each topic: a primary keyword and 3 secondary keywords, a title (under 60 characters), a meta description (under 155), an outline with H2/H3, then the full article (1,200+ words) in the client's voice with internal-link suggestions, one call to action, and an FAQ block. Do not invent statistics; flag any claim that needs a source.`;
    case "build-newsletter":
      return `${intro}
You are an email developer. BUILD THE NEWSLETTER TEMPLATE as responsive HTML email.

${ctx}
${brandBlock(c)}
## Requirements
- One fenced code block with a complete HTML email: table-based layout, inline CSS, 600px max width, dark-mode friendly, bulletproof buttons, preheader text, plain-text alternative below it
- Brand colours, fonts (with web-safe fallbacks) and logo placeholder; header, hero, 2-3 content blocks, call to action, footer with unsubscribe and address placeholders
- Languages: ${lang(c)}
- Works in Gmail, Outlook and Apple Mail; keep under 100 KB
Include the merge tags to use (first name, unsubscribe) as {{ placeholders }} and a short testing checklist.`;
  }
}
