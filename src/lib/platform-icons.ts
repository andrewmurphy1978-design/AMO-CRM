// Real brand icons for social platforms and messaging apps, via Simple
// Icons' CDN build (each SVG already carries that brand's own color) —
// same "reference a public icon CDN by URL" approach already used for
// country flags (country-flag.ts) and crypto logos (markets.ts), rather
// than hand-maintaining SVG path data locally.
const SIMPLE_ICONS_BASE = "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons";

const SLUGS: Record<string, string> = {
  Facebook: "facebook",
  Instagram: "instagram",
  LinkedIn: "linkedin",
  TikTok: "tiktok",
  YouTube: "youtube",
  X: "x",
  WhatsApp: "whatsapp",
  Telegram: "telegram",
  Discord: "discord",
  Signal: "signal",
  Skype: "skype",
  WeChat: "wechat",
  Line: "line",
  Viber: "viber",
};

// Null for platforms with no real brand icon ("Website", "Other") — the
// caller falls back to a generic icon for those.
export function platformIconUrl(platform: string): string | null {
  const slug = SLUGS[platform];
  return slug ? `${SIMPLE_ICONS_BASE}/${slug}.svg` : null;
}

export const MESSAGING_APPS = ["Telegram", "Discord", "Signal", "Skype", "WeChat", "Line", "Viber", "Other"];
