// Hand-drawn like calendar-app/page.tsx's GoogleCalendarIcon — neither
// provider publishes a Simple Icons mono mark that reads clearly at
// button size, so these recreate the general look (Gmail's colored
// envelope; IONOS has no simple icon mark at all, so this uses its brand
// blue with a generic mail glyph instead) rather than a literal mark.

export function GmailIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" fill="#fff" stroke="#dadce0" strokeWidth="0.5" />
      <path d="M4 5h4l4 3.3L4 12.6z" fill="#fbbc04" />
      <path d="M20 5h-4l-4 3.3 8 4.3z" fill="#ea4335" />
      <path d="M2 6.6v9.4A2 2 0 0 0 4 18h2V10z" fill="#4285f4" />
      <path d="M22 6.6v9.4A2 2 0 0 1 20 18h-2V10z" fill="#34a853" />
      <path d="M2 6.6 12 14 22 6.6" fill="none" stroke="#c5221f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IonosIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1" y="4" width="22" height="16" rx="3" fill="#003d8f" />
      <rect x="4.5" y="7.5" width="15" height="9" rx="1.3" fill="none" stroke="#fff" strokeWidth="1.3" />
      <path d="M4.8 8 12 12.6 19.2 8" fill="none" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
