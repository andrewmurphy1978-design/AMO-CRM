// Shared tag pill coloring — used by the Contacts list, the contact detail
// Tags card, and the tag combobox — so a given tag always looks the same
// wherever it appears.
export type TagKind =
  | "fr"
  | "en"
  | "services"
  | "training"
  | "ai"
  | "nurture"
  | "social"
  | "automation"
  | "affiliate"
  | "application"
  | "other";

const NAME_TO_KIND: Record<string, TagKind> = {
  "français": "fr",
  francais: "fr",
  french: "fr",
  english: "en",
  anglais: "en",
  services: "services",
  service: "services",
  training: "training",
  formation: "training",
  ai: "ai",
  ia: "ai",
  "intelligence artificielle": "ai",
  nurture: "nurture",
  nurturing: "nurture",
  "social media": "social",
  "médias sociaux": "social",
  "medias sociaux": "social",
  "réseaux sociaux": "social",
  "reseaux sociaux": "social",
  automation: "automation",
  automatisation: "automation",
  "affiliate marketing": "affiliate",
  "marketing d'affiliation": "affiliate",
  affiliate: "affiliate",
  application: "application",
};

export function tagKind(name: string): TagKind {
  return NAME_TO_KIND[name.trim().toLowerCase()] ?? "other";
}

export const TAG_KIND_RANK: Record<TagKind, number> = {
  fr: 0,
  en: 1,
  services: 2,
  training: 3,
  ai: 4,
  nurture: 5,
  social: 6,
  automation: 7,
  affiliate: 8,
  application: 9,
  other: 10,
};

export const TAG_KIND_COLORS: Record<TagKind, string> = {
  fr: "bg-sky-50 text-sky-700",
  en: "bg-red-50 text-red-600",
  services: "bg-[#f0c040] text-[#1e4430]",
  training: "bg-[#0b3d6b] text-white",
  ai: "bg-[#0fa38a] text-[#0d2b1a]",
  nurture: "bg-[#2ecc71] text-[#0d2b1a]",
  social: "bg-[#29abe2] text-white",
  automation: "bg-[#7c3aed] text-white",
  affiliate: "bg-[#e67e22] text-white",
  application: "bg-[#64748b] text-white",
  other: "bg-black/5 text-soft",
};

export function sortTags<T extends { tag: { name: string } }>(tags: T[]): T[] {
  return [...tags].sort((a, b) => {
    const rankDiff = TAG_KIND_RANK[tagKind(a.tag.name)] - TAG_KIND_RANK[tagKind(b.tag.name)];
    if (rankDiff !== 0) return rankDiff;
    return a.tag.name.localeCompare(b.tag.name);
  });
}
