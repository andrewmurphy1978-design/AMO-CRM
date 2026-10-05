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
  if (isDataUri(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  return /^[\w-]+(\.[\w-]+)+(\/|$)/.test(url) ? `https://${url}` : null;
}

// A file picked from the computer is stored inline as a data: URI.
export const MAX_BRAND_FILE_BYTES = 600_000;

export function isDataUri(v: string | null | undefined): boolean {
  return /^data:[\w.+-]+\/[\w.+-]+;base64,/i.test((v ?? "").trim());
}

// A file already saved on the Brand card, referred to by its row id while the card is edited (the file
// itself never travels to the browser): "kept:<id>".
export const KEPT_PREFIX = "kept:";
export const isKept = (v: string | null | undefined) => (v ?? "").startsWith(KEPT_PREFIX);
export const keptId = (v: string) => v.slice(KEPT_PREFIX.length);
export const mimeIsImage = (m: string | null | undefined) => /^image\/(png|jpe?g|gif|webp|svg\+xml)$/i.test(m ?? "");

export function dataUriIsImage(v: string): boolean {
  return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(v.trim());
}

export const BRAND_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Oswald", "Raleway", "Nunito", "Nunito Sans", "Source Sans 3", "Ubuntu",
  "Work Sans", "Rubik", "Mulish", "Quicksand", "Barlow", "DM Sans", "Manrope", "Josefin Sans", "Karla", "Fira Sans", "Cabin", "Archivo",
  "Playfair Display", "Merriweather", "Lora", "PT Serif", "Libre Baskerville", "Cormorant Garamond", "EB Garamond", "Crimson Text", "Bitter", "Noto Serif",
  "Bebas Neue", "Anton", "Abril Fatface", "Lobster", "Pacifico", "Dancing Script", "Great Vibes", "Caveat", "Satisfy", "Permanent Marker",
  "Roboto Mono", "Source Code Pro", "Fira Code", "JetBrains Mono", "Space Mono",
  "Arial", "Helvetica", "Helvetica Neue", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Garamond", "Courier New", "Calibri", "Cambria", "Segoe UI", "Futura", "Gotham", "Avenir", "Proxima Nova", "Gill Sans", "Didot", "Baskerville",
];

export function safeHexColor(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? (v.startsWith("#") ? v : `#${v}`) : null;
}
