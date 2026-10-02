import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getAllProjectTemplates, getSavedTypes } from "@/lib/project-template-store";
import { getCustomProjectTypes, mergeTypeLabels, getOrderedTypeKeys } from "@/lib/project-type-store";
import PageHeader from "../page-header";
import TemplateEditor from "./template-editor";
import TypeSidebar from "./type-sidebar";

export default async function ProjectTypesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: typeParam } = await searchParams;
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);

  const { templates, saved, hour12, customTypes, typeKeys } = await withScopedPrismaClient(async (db) => {
    const templates = await getAllProjectTemplates(db);
    const saved = await getSavedTypes(db);
    const hour12 = await getHour12(session, db);
    const customTypes = await getCustomProjectTypes(db);
    const typeKeys = await getOrderedTypeKeys(db, customTypes);
    return { templates, saved, hour12, customTypes, typeKeys };
  });

  const type = typeKeys.includes(typeParam ?? "") ? (typeParam as string) : "WEBSITE";
  const typeLabels = mergeTypeLabels(t.projectTypes as Record<string, string>, customTypes, lang);

  return (
    <div className="space-y-6">
      <PageHeader title={lang === "fr" ? "Personnalisation des types de projet" : "Project type customization"} hour12={hour12} lang={lang} location={t.dashboard.myLocation} />

      <div className="grid gap-6 md:grid-cols-[13.5rem_minmax(0,1fr)] md:items-start">
        <TypeSidebar keys={typeKeys} labels={typeLabels} saved={saved} selected={type} lang={lang} />

        <div className="min-w-0">
          <TemplateEditor key={type} type={type} typeKeys={typeKeys} isUserType={customTypes.some((c) => c.key === type)} initial={templates[type]} typeLabels={typeLabels} isCustom={saved.includes(type)} />
        </div>
      </div>
    </div>
  );
}
