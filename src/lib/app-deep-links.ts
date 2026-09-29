// Deep-link helpers for the Contact Info page's mobile-only "open the
// native app" behavior. Only platforms with a documented, reliable URI
// scheme get a link here — everything else (WeChat, Line, KakaoTalk, Kik,
// Threema, imo, Zoom, Google Meet, Microsoft Teams) is left unclickable
// rather than guessing at an undocumented scheme, the same reasoning
// already applied to social platforms with no custom scheme (LinkedIn/
// TikTok/YouTube rely on their own Universal/App Link behavior on the
// stored URL instead of a fabricated one here).

function digitsOnly(value: string): string {
  return value.replace(/[^\d]/g, "");
}

// tel: is safe on both mobile (dials) and desktop (browsers either ignore
// it or hand it to an installed softphone/FaceTime), so this is used
// unconditionally rather than gated to mobile-only markup — unlike the app
// links below, which only make sense on a device that has the app.
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[\s().-]/g, "")}`;
}

interface AppLink {
  href: string;
  // true when the scheme has no web fallback (nothing sensible happens on
  // desktop), so the caller should only wire this up on the mobile-only
  // element and leave the desktop element a plain, non-clickable chip.
  mobileOnly: boolean;
}

// Universal-link-style hrefs that already fall back to a normal web page on
// desktop and hand off to the native app on mobile, so the same href is
// safe to use unconditionally.
function whatsAppLink(handle: string): AppLink {
  return { href: `https://wa.me/${digitsOnly(handle)}`, mobileOnly: false };
}
function telegramLink(handle: string): AppLink {
  return { href: `https://t.me/${handle.replace(/^@/, "")}`, mobileOnly: false };
}
function messengerLink(handle: string): AppLink {
  return { href: `https://m.me/${handle}`, mobileOnly: false };
}
function signalLink(handle: string): AppLink {
  const digits = digitsOnly(handle);
  return { href: `https://signal.me/#p/${digits ? `+${digits}` : handle}`, mobileOnly: false };
}

// Custom-scheme-only apps — no web fallback exists, so these are only
// wired up on the mobile-only element.
function skypeChatLink(handle: string): AppLink {
  return { href: `skype:${handle}?chat`, mobileOnly: true };
}
function skypeCallLink(handle: string): AppLink {
  return { href: `skype:${handle}?call`, mobileOnly: true };
}
function viberLink(handle: string): AppLink {
  return { href: `viber://chat?number=${digitsOnly(handle)}`, mobileOnly: true };
}
function facetimeLink(idOrPhone: string): AppLink {
  return { href: `facetime:${idOrPhone}`, mobileOnly: true };
}

// The Instant Messaging table's per-row link.
export function messagingAppLink(app: string, handle: string): AppLink | null {
  switch (app) {
    case "WhatsApp":
      return whatsAppLink(handle);
    case "Telegram":
      return telegramLink(handle);
    case "Messenger":
      return messengerLink(handle);
    case "Signal":
      return signalLink(handle);
    case "Skype":
      return skypeChatLink(handle);
    case "Viber":
      return viberLink(handle);
    default:
      return null;
  }
}

// The VoIP table's per-row link — prefers an actual "start a call" scheme
// (FaceTime/Skype) over the chat-only link above, and otherwise falls back
// to the same messaging link (a chat window is the closest verified action
// available for e.g. WhatsApp/Telegram/Discord, which have no documented
// "call this contact" URI).
export function voipAppLink(app: string, handle: string): AppLink | null {
  switch (app) {
    case "FaceTime":
      return facetimeLink(handle);
    case "Skype":
      return skypeCallLink(handle);
    default:
      return messagingAppLink(app, handle);
  }
}
