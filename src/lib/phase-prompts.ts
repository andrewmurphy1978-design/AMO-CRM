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
  brandZipAttached?: boolean; // the uploaded brand files come as a zip next to the prompt
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
  c.brandExisting.length > 0 ? `## The client's brand (use it exactly; do not invent a different one)\n${c.brandExisting.join("\n")}\n${c.brandZipAttached ? "\nThe brand files (logos, icons, photos...) are in the attached .zip: open them and use them as they are.\n" : ""}` : "## Brand\nNo brand elements are recorded yet: propose a coherent, modern palette and font pairing and state them as CSS variables.\n";

const lang = (c: PromptContext) => (c.languages.length ? c.languages.join(" and ") : c.clientLanguage === "fr" ? "French" : "English");

export function buildPhasePrompt(kind: PhaseKind, c: PromptContext): string {
  const intro = `You are working on the "${c.phaseName}" phase of a client project. Tasks of this phase:\n${list(c.tasks)}\n`;
  const ctx = contextBlock(c);
  switch (kind) {
    case "research":
      return `${intro}
You are a senior market and competitor researcher. Produce the RESEARCH REPORT for this project.

${ctx}
## Deliver in ENGLISH ONLY (one single language: my CRM writes the French version itself, so do NOT translate or duplicate anything) as downloadable FILES, not as an artifact, canvas or long chat reply
1. research-report.md: ONE Markdown file. Use EXACTLY these level-2 headings, in this order, with these names in English even if the text is in another language (my CRM reads them and merges several reports):
   ## Executive summary
   5 short bullets.
   ## Offer and positioning
   The client's offer and positioning today, in 2 short paragraphs.
   ## Competitors
   ONE Markdown table, one row per competitor (6 to 10 rows: direct and indirect), with exactly these columns in this order: Name | URL | Type | Offer | Pricing | Positioning | Strengths | Weaknesses | Tech and SEO notes | Source
   - Name: the competitor's official brand name, written the same way everywhere. URL: the full https:// address of its main site. Type: "Direct" or "Indirect". Source: the URL where you found the facts.
   ## Audience and search intent
   Who searches, what they ask, what they compare (2 short paragraphs; the keywords go in the Keywords table below).
   ## Keywords
   ONE Markdown table of the 15 to 30 most important keywords and questions people search: Keyword | Intent | Volume (estimate or "unknown") | Difficulty (estimate or "unknown") | Priority (High, Medium or Low) | Source
   ${c.tasks.some((t) => /blog|content plan/i.test(t)) ? `## Competitor blogs
   ONE Markdown table, one row per competitor blog reviewed (at least 5): Competitor | Blog URL | Topics covered | Posting frequency | Formats | Gaps and opportunities | Source
   ## Content plan
   ONE Markdown table of 20 to 30 article ideas for the client's blog: # | Title | Target keyword | Format | Language | Priority | Notes
   ` : ""}## Design and UX patterns
   Bullets: what the best competitors do well (pages, sections, calls to action), each naming the competitor.
   ## Gaps and differentiators
   Bullets: what the client can own.
   ## Recommendations
   For this project (${c.types.map((t) => t.label).join(", ") || "the project"}): structure, messaging, features, pricing cues. One bullet per recommendation written "- Title: explanation".
   ## Risks and open questions
   Bullets.
   ## Screenshots
   ONE Markdown table, one row per screenshot file: File | Competitor | Page | What it shows (the File is the exact file name inside research-assets.zip).
   ## Sources
   A numbered list of every URL used.
2. research-assets.zip: ONE zip of REAL screenshots of the competitors' pages. Take them yourself, now, WITHOUT waiting for me to ask or confirm: open each competitor's pages with your browser tool (in Claude: the Claude in Chrome extension, in a new tab; in ChatGPT: the agent / browse mode) and capture them (home page, pricing page, and the best sections or calls to action). Never invent or mock up a screenshot. If your browser tool is not available, say so in ONE line at the top of your reply, still deliver research-report.md, and keep the Screenshots table as a list of what I should capture by hand.
   - Files: PNG (JPEG is accepted too if PNG is not possible; never SVG, WebP or links), each under 800 KB and at least 1200 px wide, named like competitor-name-page.png (for example acme-home.png, acme-pricing.png).
Give me the file(s) to download, nothing else to copy and paste.

## Rules
- Cite a source URL for every factual claim; mark anything you could not verify as "unverified".
- Do not invent competitors, prices or statistics.
- No code blocks and no HTML in the Markdown file; plain Markdown only.
- Keep each cell of the tables short (one line), so that reports from several AIs can be merged without losing information.`;
    case "brand":
      return `${intro}
You are a brand designer. Create the BRAND for this client and write it up as a brand report the client can approve.

${ctx}
${brandBlock(c)}
## The brand must include
${list(c.brandWanted, "- logos, colour palette, fonts, brand voice and a brand guide")}

## Deliver in ENGLISH ONLY (one single language: my CRM writes the French version itself, so do NOT translate or duplicate anything) as TWO downloadable files. Do NOT answer with an artifact, canvas or a long chat reply: create real files I can download.
1. brand-report.md: ONE Markdown file. Use exactly these level-2 headings (only for the items above): "## Logos", "## Colours", "## Fonts", "## Icons", "## Graphics and patterns", "## Photos", "## Components", "## Charts", "## Voice and tone".
   - Logos / Icons / Graphics and patterns / Photos / Components / Charts: a bullet list, one bullet per asset, written as "- Name: short description (file name in the zip)". Describe them in words; do NOT paste SVG or code blocks in this file.
   - Colours: a Markdown table with the columns Name | HEX | RGB | Usage (primary, secondary, accent, neutrals), HEX written as #RRGGBB, plus usage rules and WCAG AA contrast checks under the table.
   - Fonts: one bullet per font as "- Font name: where it is used" (free Google Fonts, heading + body pairing), then the sizes and line-height scale.
   - Voice and tone: bullets such as "- Tone: ..." and "- Audience: ...", 5 attributes, a do/don't list and 3 sample sentences.
   - Start with a short summary and end with a "Brand guide contents" list (one topic per page of the PDF guide).
2. brand-assets.zip: ONE zip with image FILES for EVERY section of the report, so that every section of the brand guide can show its own images. Real image files, not code and not links.
   - File types: PNG for everything (JPEG is accepted if you cannot make PNG, for example for photos; the PDF guide can only use PNG or JPEG, never WebP): at least 1200 px wide for logos, banners and mock-ups, 256 x 256 px for icons, each file under 500 KB, transparent background where it makes sense. Also add the SVG version of every logo and icon.
   - Folders and files (use exactly these folder names; every file is named in the matching section of brand-report.md):
     logos/ : logo-main-light.png, logo-main-dark.png, logo-horizontal-light.png, logo-horizontal-dark.png, logo-icon-light.png, logo-icon-dark.png (+ the .svg of each) and concept-a.png, concept-b.png, concept-c.png for the 3 concepts
     colours/ : palette.png, a swatch sheet showing every colour with its name and HEX code
     fonts/ : typography-specimen.png, the heading and body fonts set in sample text, with the type scale
     icons/ : 6 to 12 icons, one file each (icon-home.png, icon-search.png...) + the .svg of each
     graphics/ : banner-*.png (social covers), pattern-*.png (patterns and textures), illustration-*.png
     photos/ : photo-style-1.png, photo-style-2.png, photo-style-3.png (example images or mood boards showing the photo style)
     components/ : buttons.png (all states), form.png, card.png, navigation.png (rendered examples)
     charts/ : chart-bar.png, chart-line.png, chart-pie.png (example charts in the brand colours)
     voice/ : voice-sample.png (optional: a quote card with a sample sentence)
   - Skip a folder only if the client's brand does not include that item.
Give me the two files to download, nothing else to copy and paste.`;
    case "mockup": {
      const wants = (re: RegExp) => c.types.some((t) => re.test(t.label));
      const kinds = [
        wants(/website|site/i) && "Website",
        wants(/funnel|entonnoir/i) && "Funnel",
        wants(/blog/i) && "Blog",
        wants(/\bapp\b|application/i) && "App",
      ].filter(Boolean) as string[];
      const all = kinds.length ? kinds : ["Website"];
      const sections: Record<string, string> = {
        Website: `Sitemap${c.pages.length ? ` (pages requested: ${c.pages.join(", ")})` : ""}; for each page: goal, sections in order (hero, benefits, proof, calls to action, footer), copy outline and a text wireframe${c.forms.length ? `; forms: ${c.forms.join(", ")} (fields, validation, thank-you behaviour)` : ""}`,
        Funnel: `Every step from the opt-in or ad landing to the thank-you / sales / upsell pages${c.funnels.length ? ` (funnels: ${c.funnels.join(", ")})` : ""}: goal of each step, sections in order, headline and call-to-action copy, form fields, what happens after each click`,
        Blog: `The blog home, a category page, an article page (with author box, related posts, newsletter sign-up) and a sample article outline${c.topics.length ? ` (topics: ${c.topics.join(", ")})` : ""}: layout, sections, navigation, sidebar and call-to-action placement`,
        App: "Screen list and navigation map; the key user flows step by step (sign-up / log-in, main task, settings); for each screen: purpose, components, states (empty, loading, error) and a text wireframe",
      };
      return `${intro}
You are a senior UX/UI designer. Produce ALL the mock-ups of this project in THIS SAME reply and deliverable (${all.join(", ")}): the client approves them together. Do not ask me to request them one by one.

${ctx}
${brandBlock(c)}
## Deliver (in ${lang(c)})
1. mockup-report.md: ONE Markdown file with one top-level section per mock-up, in this order and with exactly these headings:
${all.map((k, i) => `   ${i + 1}) "# ${k} mock-up": ${sections[k]}`).join("\n")}
   Then: "# Design tokens" (colours, fonts, spacing, radius from the brand, as CSS variables, shared by every mock-up), "# Responsive, interaction and accessibility notes" (mobile, tablet, desktop; animation; WCAG AA) and "# Approval checklist" (a checklist the client can tick, one block per mock-up).
2. mockup-assets.zip: ONE zip of real PNG images (at least 1440 px wide for desktop screens, 390 px wide for mobile screens), in one folder per mock-up (${all.map((k) => `${k.toLowerCase()}/`).join(", ")}): the main screens or pages of each mock-up, drawn with the brand colours, fonts and logos${c.brandZipAttached ? " from the attached brand zip" : ""}. Name the files like ${all[0].toLowerCase()}/home-desktop.png. Real image files, not code and not links. If you cannot create images, say so in ONE line at the top of your reply and still deliver mockup-report.md.
Keep it concrete enough that a developer can build from it without questions. Give me the two files to download, nothing else to copy and paste.`;
    }
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
