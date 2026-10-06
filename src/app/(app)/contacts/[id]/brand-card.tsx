import Card from "@/components/section-card";
import type { Lang } from "@/lib/i18n/dictionaries";
import { BRAND_CATEGORIES, isKept, mimeIsImage, safeBrandUrl, safeHexColor, type BrandItemInput } from "@/lib/brand";
import { saveContactBrand } from "@/actions/contact-brand";
import BrandDialog from "./brand-dialog";
import BrandReportDrop from "./brand-report-drop";
import type { FileRow } from "@/components/files-card";

const LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide text-soft";

export interface BrandItemRow extends BrandItemInput {
  id: string;
  mime?: string; // for an uploaded file (value is then "kept:<id>")
}

// A contact's Brand card: logos, colours, fonts, voice, photos, components,
// icons, graphics and charts — shown by category, edited in one dialog.
export function BrandCard({ contactId, items, lang, reports = [] }: { contactId: string; items: BrandItemRow[]; lang: Lang; reports?: FileRow[] }) {
  const fr = lang === "fr";
  const total = items.length;

  return (
    <Card
      color="brand"
      title={
        <>
          Brand
          {total > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{total}</span>}
        </>
      }
      compact
      actions={<BrandDialog action={saveContactBrand.bind(null, contactId)} items={items.map(({ category, label, value, note }) => ({ category, label, value, note }))} lang={lang} />}
    >
      <BrandReportDrop contactId={contactId} reports={reports} fr={fr} />
      {total === 0 ? (
        <p className="text-sm text-soft">{fr ? "Aucun élément de marque pour le moment." : "No brand assets yet."}</p>
      ) : (
        <div className="space-y-4">
          {BRAND_CATEGORIES.map((cat) => {
            const list = items.filter((i) => i.category === cat.key);
            if (list.length === 0) return null;
            return (
              <div key={cat.key}>
                <p className={LABEL_CLASS}>{fr ? cat.fr : cat.en}</p>
                <div className={`mt-1.5 ${cat.mode === "text" || cat.mode === "font" ? "space-y-1" : "flex flex-wrap gap-3"}`}>
                  {list.map((item) => {
                    const inline = isKept(item.value);
                    const url = inline ? `/api/brand-files/${item.id}` : safeBrandUrl(item.value);
                    if (cat.mode === "color") {
                      const hex = safeHexColor(item.value);
                      return (
                        <div key={item.id} className="flex items-center gap-2" title={item.note || undefined}>
                          <span className="h-8 w-8 shrink-0 rounded-md border border-card-border" style={{ backgroundColor: hex ?? "transparent" }} />
                          <span className="text-xs leading-tight text-ink">
                            <span className="block font-medium">{item.label}</span>
                            <span className="text-soft">{hex ?? item.value}</span>
                          </span>
                        </div>
                      );
                    }
                    if (cat.mode === "text") {
                      return (
                        <p key={item.id} className="text-sm text-ink">
                          <span className="font-medium">{item.label}:</span> <span className="whitespace-pre-wrap">{item.value}</span>
                          {item.note && <span className="text-xs text-soft"> — {item.note}</span>}
                        </p>
                      );
                    }
                    if (cat.mode === "font") {
                      return (
                        <p key={item.id} className="text-sm text-ink">
                          <span className="font-medium">{item.label}</span>
                          {item.value && (
                            <span className="text-soft">
                              {" · "}
                              {url ? (
                                <a href={url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                                  {item.value}
                                </a>
                              ) : (
                                item.value
                              )}
                            </span>
                          )}
                          {item.note && <span className="text-xs text-soft"> — {item.note}</span>}
                        </p>
                      );
                    }
                    // image-like: a thumbnail that links to the file; if the
                    // link isn't an image the thumbnail stays blank and the
                    // label is still a link.
                    const isImg = url ? (inline ? mimeIsImage(item.mime) : true) : false;
                    const thumb = isImg ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user-supplied image links / uploaded data URIs
                      <img src={url as string} alt={item.label} loading="lazy" className="h-16 w-24 rounded-md border border-card-border bg-black/5 object-contain" />
                    ) : (
                      <span className="flex h-16 w-24 items-center justify-center rounded-md border border-card-border bg-black/5 text-lg text-soft">{url ? "📎" : "—"}</span>
                    );
                    return (
                      <div key={item.id} className="w-24" title={item.note || undefined}>
                        {url ? (
                          <a href={url} {...(inline ? { target: "_blank", rel: "noreferrer" } : { target: "_blank", rel: "noreferrer" })} className="block">
                            {thumb}
                            <span className="mt-0.5 block truncate text-xs text-emerald-700 hover:underline">{item.label}</span>
                          </a>
                        ) : (
                          <>
                            {thumb}
                            <span className="mt-0.5 block truncate text-xs text-ink">{item.label}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
