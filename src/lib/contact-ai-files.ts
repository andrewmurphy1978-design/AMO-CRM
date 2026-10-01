// The Markdown files the "Export for AI" menu offers for a contact (names
// only — safe to import from client code; the content is built server-side
// in contact-ai-export.ts).
export const CONTACT_AI_FILES = [
  { name: "00-README.md", label: "Index (start here)" },
  { name: "01-profile.md", label: "Profile & contact info" },
  { name: "02-ai-context.md", label: "AI context & notes" },
  { name: "03-brand.md", label: "Brand" },
  { name: "04-tech-stack-and-domains.md", label: "Tech stack & domains" },
  { name: "05-projects.md", label: "Projects, phases & tasks" },
  { name: "06-communications.md", label: "Calls, texts & emails" },
] as const;
