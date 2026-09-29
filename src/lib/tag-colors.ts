import type { TagCategory } from "@prisma/client";

// Shared tag pill coloring — used by the Contacts list, the contact detail
// Tags card, and the tag combobox — so a given tag always looks the same
// wherever it appears.
//
// This started as a purely name-based heuristic (NAME_TO_KIND below) before
// Tag rows carried their own category/color/order columns. It's kept as the
// fallback for every tag that predates those columns (every real systeme.io
// tag synced so far, e.g. "VIP") so their look and relative order doesn't
// change. New tags — starting with the CRM-only "personal" ones managed
// from Settings — carry an explicit category/color/order on the row instead
// of needing a name added here.
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

export function isLanguageTag(name: string): boolean {
  const kind = tagKind(name);
  return kind === "fr" || kind === "en";
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

// The shape every tag-coloring/sorting helper below needs — a subset of the
// Prisma Tag row, so callers can pass either the full row or a narrower
// shape without extra mapping.
export interface TagLike {
  name: string;
  category?: TagCategory | null;
  color?: string | null;
  order?: number | null;
}

// Same three-group layout the Contact form's tag picker renders (language,
// then personal, then systeme.io), separated visually by a divider between
// each — see groupTagsByCategory below.
const CATEGORY_RANK: Record<TagCategory, number> = { LANGUAGE: 0, PERSONAL: 1, SYSTEME_IO: 2 };

function effectiveCategory(tag: TagLike): TagCategory {
  return tag.category ?? "SYSTEME_IO";
}

// PERSONAL tags sort by their admin-set `order` (Settings has up/down
// reorder controls); LANGUAGE/SYSTEME_IO tags keep the legacy name-based
// rank so pre-existing systeme.io tag ordering is unaffected by this.
function sortKey(tag: TagLike): [number, number, string] {
  const category = effectiveCategory(tag);
  const secondary = category === "PERSONAL" ? (tag.order ?? 0) : TAG_KIND_RANK[tagKind(tag.name)];
  return [CATEGORY_RANK[category], secondary, tag.name.toLowerCase()];
}

function compareTags(a: TagLike, b: TagLike): number {
  const [ra, sa, na] = sortKey(a);
  const [rb, sb, nb] = sortKey(b);
  return ra - rb || sa - sb || na.localeCompare(nb);
}

export function sortTagLikes<T extends TagLike>(tags: T[]): T[] {
  return [...tags].sort(compareTags);
}

export function sortTags<T extends { tag: TagLike }>(tags: T[]): T[] {
  return [...tags].sort((a, b) => compareTags(a.tag, b.tag));
}

// Splits an already-sorted (or not) list into the three display groups —
// used by the Contact form's tag checklist to render a divider between
// each, mirroring the divider that used to sit only between language and
// everything else.
export function groupTagsByCategory<T extends TagLike>(tags: T[]): { language: T[]; personal: T[]; systemeIo: T[] } {
  const sorted = sortTagLikes(tags);
  return {
    language: sorted.filter((t) => effectiveCategory(t) === "LANGUAGE"),
    personal: sorted.filter((t) => effectiveCategory(t) === "PERSONAL"),
    systemeIo: sorted.filter((t) => effectiveCategory(t) === "SYSTEME_IO"),
  };
}

// A tag with its own `color` (hex) renders with that exact light background
// and a fixed dark, readable text color via inline style; everything else
// falls back to the legacy name-based Tailwind classes above.
export function tagPillStyle(tag: TagLike): { className: string; style?: { backgroundColor: string; color: string } } {
  if (tag.color) {
    return { className: "", style: { backgroundColor: tag.color, color: "#1f2937" } };
  }
  return { className: TAG_KIND_COLORS[tagKind(tag.name)] };
}

// Whether this tag should ever be created/attached on systeme.io — gates
// the push in addTagToContactWith (actions/contacts.ts). PERSONAL tags are
// CRM-only organizational labels (e.g. "Famille", "Fournisseur") and never
// touch systeme.io; LANGUAGE and SYSTEME_IO tags (the default for every tag
// that existed before this category was added) keep today's behavior.
export function isSystemeIoPushable(tag: TagLike): boolean {
  return effectiveCategory(tag) !== "PERSONAL";
}
