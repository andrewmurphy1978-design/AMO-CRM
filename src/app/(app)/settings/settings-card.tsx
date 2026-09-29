import type { ReactNode } from "react";

// One shared card shell for every settings section — tighter padding on
// mobile (this page stacks a lot of these) than the app's other bordered
// cards, which mostly appear one or two at a time per page.
export default function SettingsCard({
  title,
  description,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-6">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      {title && <h2 className="font-display text-base font-semibold text-ink sm:text-lg">{title}</h2>}
      {description && <p className="mt-1 text-sm text-soft">{description}</p>}
      <div className={title || description ? "mt-3 sm:mt-4" : undefined}>{children}</div>
    </section>
  );
}

// A small uppercase label separating clusters of related cards within a
// tab — lighter than another full nested card, just enough to break up a
// long stack of settings into scannable groups.
export function SettingsGroupLabel({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-soft first:mt-0">{children}</h3>;
}
