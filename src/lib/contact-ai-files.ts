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
  { name: "07-purchases-sync-and-activity.md", label: "Purchases, sync & activity" },
] as const;

// The Project page's pack: project files first, then the client's Contact files.
export const PROJECT_AI_FILES = [
  { name: "00-README.md", label: "Index & instructions (start here)" },
  { name: "01-project.md", label: "Project, phases & tasks" },
  { name: "02-project-proposals-and-invoices.md", label: "Proposals, instalments & invoices" },
  { name: "03-project-communications.md", label: "Calls, texts, emails & calendar" },
  ...CONTACT_AI_FILES.map((f) => ({ name: `contact-${f.name}`, label: `Client · ${f.label}` })),
] as const;
