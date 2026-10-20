"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

// A section of the Settings screen: one entry in the left menu, one panel on the right.
export interface SettingsSectionDef {
  id: string;
  scope: "user" | "admin";
  group: string;
  label: string;
  description?: string;
  icon: SettingsIconName;
  content: ReactNode;
}

export type SettingsIconName =
  | "link" | "user" | "clock" | "globe" | "chart" | "sparkles" | "squares" | "envelope" | "shield" | "palette"
  | "users" | "card" | "folder" | "tag" | "bolt" | "key" | "wrench" | "document" | "phone" | "eye";

const ICON_PATHS: Record<SettingsIconName, string> = {
  link: "M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244",
  user: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
  clock: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  globe: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
  chart: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
  sparkles: "M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z",
  squares: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  envelope: "M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75",
  shield: "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
  palette: "M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z",
  users: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  card: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z",
  folder: "M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z",
  tag: "M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3ZM6 6h.008v.008H6V6Z",
  bolt: "m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z",
  key: "M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z",
  wrench: "M21.75 6.75a4.5 4.5 0 0 1-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 1 1-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 0 1 6.336-4.486l-3.276 3.276a3.004 3.004 0 0 0 2.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852Z",
  document: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  phone: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z",
  eye: "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
};

function Icon({ name, className }: { name: SettingsIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className={className ?? "h-5 w-5"} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[name]} />
    </svg>
  );
}

// The Settings screen: a second left-hand menu (grouped, searchable) and the one section picked in it on the
// right, instead of every card stacked on one long page. The picked section is kept in the URL hash so a
// section can be bookmarked or linked to.
export default function SettingsLayout({
  sections,
  labels,
}: {
  sections: SettingsSectionDef[];
  labels: { mine: string; admin: string; search: string; noMatch: string; menu: string };
}) {
  const [active, setActive] = useState(sections[0]?.id);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (id && sections.some((s) => s.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [sections]);

  function pick(id: string) {
    setActive(id);
    try {
      window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    } catch {
      // the hash is only a convenience
    }
    window.scrollTo({ top: 0 });
  }

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (q ? sections.filter((s) => `${s.label} ${s.group} ${s.description ?? ""}`.toLowerCase().includes(q)) : sections), [sections, q]);

  // scope -> group -> sections, in the order given
  const tree = useMemo(() => {
    const out: { scope: "user" | "admin"; groups: { name: string; items: SettingsSectionDef[] }[] }[] = [];
    for (const s of visible) {
      let scope = out.find((x) => x.scope === s.scope);
      if (!scope) out.push((scope = { scope: s.scope, groups: [] }));
      let group = scope.groups.find((g) => g.name === s.group);
      if (!group) scope.groups.push((group = { name: s.group, items: [] }));
      group.items.push(s);
    }
    return out;
  }, [visible]);

  const current = sections.find((s) => s.id === active) ?? sections[0];
  if (!current) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-6">
      {/* Mobile: a plain picker (the menu would push the content far down) */}
      <div className="lg:hidden">
        <label className="sr-only" htmlFor="settings-section">{labels.menu}</label>
        <select
          id="settings-section"
          value={current.id}
          onChange={(e) => pick(e.target.value)}
          className="w-full rounded-xl border border-card-border bg-card-bg px-3 py-2.5 text-sm font-medium text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        >
          {(["user", "admin"] as const).map((scope) => {
            const inScope = sections.filter((s) => s.scope === scope);
            if (inScope.length === 0) return null;
            const groups = [...new Set(inScope.map((s) => s.group))];
            return groups.map((g) => (
              <optgroup key={`${scope}-${g}`} label={`${scope === "user" ? labels.mine : labels.admin} · ${g}`}>
                {inScope.filter((s) => s.group === g).map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </optgroup>
            ));
          })}
        </select>
      </div>

      {/* Desktop: the second sidebar */}
      <nav aria-label={labels.menu} className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm">
          <div className="relative mb-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-soft" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={labels.search}
              className="w-full rounded-lg border border-card-border bg-field-bg py-2 pl-8 pr-3 text-sm text-ink focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
          </div>

          {tree.length === 0 && <p className="px-2 py-3 text-sm text-soft">{labels.noMatch}</p>}

          {tree.map((scope, si) => (
            <div key={scope.scope} className={si > 0 ? "mt-4 border-t border-card-border pt-4" : undefined}>
              {sections.some((s) => s.scope === "admin") && (
                <p className="mb-2 px-2 font-display text-xs font-bold uppercase tracking-wider text-amo-green">
                  {scope.scope === "user" ? labels.mine : labels.admin}
                </p>
              )}
              {scope.groups.map((group) => (
                <div key={group.name} className="mb-3 last:mb-0">
                  <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-soft">{group.name}</p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const on = item.id === current.id;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => pick(item.id)}
                            aria-current={on ? "page" : undefined}
                            className={`group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                              on ? "bg-amo-green font-semibold text-amo-white shadow-sm" : "text-ink hover:bg-black/5"
                            }`}
                          >
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${on ? "bg-amo-lime/25 text-amo-lime" : "bg-black/5 text-soft group-hover:text-ink"}`}>
                              <Icon name={item.icon} className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </nav>

      {/* The picked section */}
      <section key={current.id} className="min-w-0">
        <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
          <div className="h-[3px] amo-card-accent" />
          <header className="flex items-start gap-4 border-b border-card-border bg-gradient-to-r from-amo-lime/10 to-transparent px-4 py-4 sm:px-6 sm:py-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amo-green text-amo-lime shadow-sm">
              <Icon name={current.icon} className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-soft">
                {current.scope === "admin" ? `${labels.admin} · ` : ""}
                {current.group}
              </p>
              <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">{current.label}</h2>
              {current.description && <p className="mt-1 max-w-2xl text-sm text-soft">{current.description}</p>}
            </div>
          </header>
          <div className="p-4 sm:p-6">{current.content}</div>
        </div>
      </section>
    </div>
  );
}
