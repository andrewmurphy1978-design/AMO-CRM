import Link from "next/link";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getAllProjectTemplates, getSavedTypes } from "@/lib/project-template-store";
import { TEMPLATE_TYPES } from "@/lib/project-templates";
import PageHeader from "../page-header";
import TemplateEditor from "./template-editor";

export default async function ProjectTypesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: typeParam } = await searchParams;
  const type = (TEMPLATE_TYPES as readonly string[]).includes(typeParam ?? "") ? (typeParam as string) : "WEBSITE";
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);

  const { templates, saved, hour12 } = await withScopedPrismaClient(async (db) => {
    const templates = await getAllProjectTemplates(db);
    const saved = await getSavedTypes(db);
    const hour12 = await getHour12(session, db);
    return { templates, saved, hour12 };
  });

  const typeLabels = t.projectTypes as Record<string, string>;

  return (
    <div className="space-y-6">
      <PageHeader title={lang === "fr" ? "Personnalisation des types de projet" : "Project type customization"} hour12={hour12} lang={lang} location={t.dashboard.myLocation} />

      <div className="grid gap-6 md:grid-cols-[13.5rem_minmax(0,1fr)] md:items-start">
        {/* Second sidebar: stays in view while the editor scrolls. */}
        <nav
          aria-label={lang === "fr" ? "Types de projet" : "Project types"}
          className="flex flex-wrap gap-2 md:sticky md:top-20 md:max-h-[calc(100dvh-6rem)] md:flex-col md:flex-nowrap md:gap-1 md:overflow-y-auto md:rounded-2xl md:border md:border-card-border md:bg-card-bg md:p-2 md:shadow-sm"
        >
          {TEMPLATE_TYPES.map((tp) => (
            <Link
              key={tp}
              href={`/project-types?type=${tp}`}
              scroll={false}
              className={`flex items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-sm font-medium md:rounded-lg md:border-transparent ${tp === type ? "border-emerald-600 bg-emerald-600 text-white" : "border-card-border bg-card-bg text-ink hover:border-amo-gold md:bg-transparent md:hover:bg-black/5"}`}
            >
              <span className="min-w-0 truncate">{typeLabels[tp]}</span>
              {saved.includes(tp) && <span className="text-[10px] opacity-80">●</span>}
            </Link>
          ))}
        </nav>

        <div className="min-w-0">
          <TemplateEditor key={type} type={type} initial={templates[type]} typeLabels={typeLabels} isCustom={saved.includes(type)} />
        </div>
      </div>
    </div>
  );
}
