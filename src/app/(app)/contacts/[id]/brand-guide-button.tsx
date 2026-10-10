"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runStepwiseReport } from "@/lib/stepwise-client";

// "Create the brand guide" on the Brand card (project page): the AI merges the dropped brand reports and the Brand
// card into the English and French PDF guides (same button as the brand guide task).
export default function BrandGuideButton({ projectId, hasReport, fr }: { projectId: string; hasReport: boolean; fr: boolean }) {
  const router = useRouter();
  const [gen, setGen] = useState<{ busy: boolean; progress?: string; error?: string; done?: string }>({ busy: false });

  async function create() {
    setGen({ busy: true });
    const res = await runStepwiseReport(`/api/projects/${projectId}/brand-guide`, fr, (progress) => setGen({ busy: true, progress }), "guides");
    if (res.error) setGen({ busy: false, error: res.error });
    else {
      setGen({ busy: false, done: fr ? `Guides créés : ${(res.fileNames ?? []).join(", ")}. La tâche « Créer le guide de marque » est terminée.` : `Guides created: ${(res.fileNames ?? []).join(", ")}. The "Create the brand guide" task is completed.` });
      router.refresh();
    }
  }

  return (
    <div className="rounded-lg border border-card-border bg-field-bg p-3">
      <button type="button" disabled={gen.busy || !hasReport} onClick={() => void create()} className="btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60">
        {gen.busy ? (gen.progress ?? "…") : fr ? "📄 Créer le guide de marque (EN + FR)" : "📄 Create the brand guide (EN + FR)"}
      </button>
      <p className="mt-1 text-xs text-soft">
        {hasReport
          ? fr ? "L'IA fusionne les rapports et la carte Marque en un guide, en anglais et en français (environ 1 minute)." : "The AI merges the reports and the Brand card into one guide, in English and in French (about a minute)."
          : fr ? "Déposez au moins un rapport (.md) pour pouvoir créer le guide." : "Drop at least one report (.md) to create the guide."}
      </p>
      {gen.done && <p className="mt-1 text-xs text-emerald-700">{gen.done}</p>}
      {gen.error && <p className="mt-1 text-xs text-red-600">{gen.error}</p>}
    </div>
  );
}
