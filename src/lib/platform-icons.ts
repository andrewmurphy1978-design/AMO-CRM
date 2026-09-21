// Real brand icons for social platforms and messaging apps. The shape comes
// from Simple Icons' raw npm package via jsdelivr (the same reliable CDN
// already used for crypto logos in markets.ts) — those SVGs are
// deliberately monochrome (`fill: currentColor`, no color baked in) by
// Simple Icons' own design, so PlatformIcon applies each brand's official
// color itself via a CSS mask (see platform-icon.tsx) rather than trusting
// a third-party "pre-colored" icon CDN to have every slug indexed — one
// such service 404'd on LinkedIn/Skype/Microsoft Teams even though jsdelivr
// has always had them.
const SIMPLE_ICONS_BASE = "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons";

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
  // No Simple Icons entry for these — PlatformIcon draws FaceTime's glyph
  // by hand instead, and falls back to the generic globe for imo.
  // imo, FaceTime
};

// Each brand's own official color, applied as a CSS mask fill — Simple
// Icons' SVGs carry no color of their own (see comment above).
const BRAND_COLORS: Record<string, string> = {
  Facebook: "#1877F2",
  Instagram: "#E4405F",
  LinkedIn: "#0A66C2",
  TikTok: "#000000",
  YouTube: "#FF0000",
  X: "#000000",
  WhatsApp: "#25D366",
  Messenger: "#0866FF",
  Telegram: "#26A5E4",
  Discord: "#5865F2",
  Signal: "#3A76F0",
  Skype: "#00AFF0",
  Snapchat: "#FFFC00",
  WeChat: "#07C160",
  Line: "#00C300",
  KakaoTalk: "#FEE500",
  Viber: "#7360F2",
  Kik: "#82BC23",
  Threema: "#3FE669",
  Zoom: "#2D8CFF",
  "Google Meet": "#00AC47",
  "Microsoft Teams": "#6264A7",
};

// Null for platforms with no real brand icon ("Website", "Other", imo,
// FaceTime) — the caller falls back to a generic icon (or, for FaceTime, a
// hand-drawn glyph) for those.
export function platformIconUrl(platform: string): string | null {
  const slug = SLUGS[platform];
  return slug ? `${SIMPLE_ICONS_BASE}/${slug}.svg` : null;
}

export function platformBrandColor(platform: string): string | null {
  return BRAND_COLORS[platform] ?? null;
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
