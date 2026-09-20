// Real brand icons for social platforms and messaging apps, via Simple
// Icons' own hosted CDN — same "reference a public icon CDN by URL"
// approach already used for country flags (country-flag.ts) and crypto
// logos (markets.ts), rather than hand-maintaining SVG path data locally.
// Deliberately NOT jsdelivr's raw npm package (cdn.jsdelivr.net/npm/
// simple-icons/icons/*.svg) — those SVGs use `fill: currentColor` with no
// color baked in, so an <img> renders them plain black. simpleicons.org's
// own CDN serves each icon pre-colored in its official brand color by
// default (a hex path segment after the slug overrides that color).
const SIMPLE_ICONS_BASE = "https://cdn.simpleicons.org";

const SLUGS: Record<string, string> = {
  Facebook: "facebook",
  Instagram: "instagram",
  LinkedIn: "linkedin",
  TikTok: "tiktok",
  YouTube: "youtube",
  X: "x",
  WhatsApp: "whatsapp",
  Messenger: "messenger",
  Telegram: "telegram",
  Discord: "discord",
  Signal: "signal",
  Skype: "skype",
  Snapchat: "snapchat",
  WeChat: "wechat",
  Line: "line",
  KakaoTalk: "kakaotalk",
  Viber: "viber",
  Kik: "kik",
  Threema: "threema",
  Zoom: "zoom",
  "Google Meet": "googlemeet",
  "Microsoft Teams": "microsoftteams",
  // No real brand icon on Simple Icons for these — fall through to the
  // generic globe glyph rather than link to a URL that 404s.
  // imo, FaceTime
};

// Null for platforms with no real brand icon ("Website", "Other", imo,
// FaceTime) — the caller falls back to a generic icon for those.
export function platformIconUrl(platform: string): string | null {
  const slug = SLUGS[platform];
  return slug ? `${SIMPLE_ICONS_BASE}/${slug}` : null;
}

// Instant-messaging apps, offered on the Contact form's unified messaging
// table (WhatsApp included — it has no separate dedicated field anymore).
export const MESSAGING_APPS = [
  "WhatsApp",
  "Messenger",
  "Telegram",
  "Discord",
  "Signal",
  "Snapchat",
  "WeChat",
  "Line",
  "KakaoTalk",
  "Viber",
  "Kik",
  "Threema",
  "imo",
  "Other",
];

// Preferred video/voice calling apps — a separate list/section from the
// instant-messaging one above (a contact can chat on WhatsApp but prefer
// Zoom for calls).
export const VOIP_APPS = [
  "Zoom",
  "Google Meet",
  "Microsoft Teams",
  "Skype",
  "FaceTime",
  "WhatsApp",
  "Messenger",
  "Telegram",
  "Signal",
  "Discord",
  "Viber",
  "Other",
];
