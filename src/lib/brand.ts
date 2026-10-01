// The categories of a contact's Brand card. Every entry has a label, a value
// and an optional note; `mode` decides how the value is entered and shown.
export type BrandMode = "image" | "color" | "font" | "text";

export interface BrandCategory {
  key: string;
  en: string;
  fr: string;
  mode: BrandMode;
  labelHint: { en: string; fr: string };
  valueHint: { en: string; fr: string };
}

const LINK = { en: "Link to the file (Drive, Dropbox, image URL…)", fr: "Lien vers le fichier (Drive, Dropbox, URL d'image…)" };

export const BRAND_CATEGORIES: BrandCategory[] = [
  { key: "logos", en: "Logos", fr: "Logos", mode: "image", labelHint: { en: "e.g. Primary logo, Dark version", fr: "ex. Logo principal, version foncée" }, valueHint: LINK },
  { key: "colours", en: "Colours", fr: "Couleurs", mode: "color", labelHint: { en: "e.g. Primary, Accent", fr: "ex. Principale, Accent" }, valueHint: { en: "#RRGGBB", fr: "#RRGGBB" } },
  { key: "fonts", en: "Fonts", fr: "Polices", mode: "font", labelHint: { en: "Font name, e.g. Montserrat", fr: "Nom de la police, ex. Montserrat" }, valueHint: { en: "Use, e.g. Headings / Body (or a link)", fr: "Usage, ex. Titres / Texte (ou un lien)" } },
  { key: "voice", en: "Voice", fr: "Voix", mode: "text", labelHint: { en: "e.g. Tone, Audience, Do, Don't, Keywords", fr: "ex. Ton, Public, À faire, À éviter, Mots-clés" }, valueHint: { en: "Describe it", fr: "Décrivez-le" } },
  { key: "photos", en: "Photos", fr: "Photos", mode: "image", labelHint: { en: "e.g. Team photo, Headshot", fr: "ex. Photo d'équipe, Portrait" }, valueHint: LINK },
  { key: "components", en: "Components", fr: "Composants", mode: "image", labelHint: { en: "e.g. Button style, Header, Card", fr: "ex. Style de bouton, En-tête, Carte" }, valueHint: LINK },
  { key: "icons", en: "Icons", fr: "Icônes", mode: "image", labelHint: { en: "e.g. Icon set, Favicon", fr: "ex. Jeu d'icônes, Favicon" }, valueHint: LINK },
  { key: "graphics", en: "Graphics", fr: "Graphiques", mode: "image", labelHint: { en: "e.g. Banner, Pattern, Illustration", fr: "ex. Bannière, Motif, Illustration" }, valueHint: LINK },
  { key: "charts", en: "Charts", fr: "Diagrammes", mode: "image", labelHint: { en: "e.g. Chart style, Template", fr: "ex. Style de diagramme, Gabarit" }, valueHint: LINK },
];

export interface BrandItemInput {
  category: string;
  label: string;
  value: string;
  note: string;
}

// Only http(s) links (or a bare domain) are ever turned into live links or
// image sources — never javascript: and friends.
export function safeBrandUrl(raw: string | null | undefined): string | null {
  const url = (raw ?? "").trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  return /^[\w-]+(\.[\w-]+)+(\/|$)/.test(url) ? `https://${url}` : null;
}

export function safeHexColor(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? (v.startsWith("#") ? v : `#${v}`) : null;
}
