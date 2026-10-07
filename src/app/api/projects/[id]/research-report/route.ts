import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { RESEARCH_PARTS, finishResearchReport, loadResearchSources, writeResearchPart, type ResearchDoc } from "@/lib/research-report";

// The Research phase's "Create the final report" button, in small steps driven by the browser (see the brand guide):
//   { step: "start" } / { step: "part", lang, part } / { step: "finish", parts: {en, fr} }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await handle(request, params);
  } catch (err) {
    console.error("research report step failed", err);
    return Response.json({ error: `Server error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}` });
  }
}

async function handle(request: Request, params: Promise<{ id: string }>) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = (await request.json()) as { step?: string; lang?: "en" | "fr"; part?: number; parts?: { en: Partial<ResearchDoc>[]; fr: Partial<ResearchDoc>[] } };

  if (body.step === "start") {
    const res = await withScopedPrismaClient((db) => loadResearchSources(db, id));
    return Response.json("error" in res ? { error: res.error } : { parts: RESEARCH_PARTS.length });
  }
  if (body.step === "part" && (body.lang === "en" || body.lang === "fr") && typeof body.part === "number") {
    const src = await withScopedPrismaClient((db) => loadResearchSources(db, id));
    if ("error" in src) return Response.json({ error: src.error });
    const res = await writeResearchPart({ ...src, lang: body.lang, part: body.part });
    return Response.json("error" in res ? { error: res.error } : { content: res });
  }
  if (body.step === "finish" && body.parts) {
    const res = await withScopedPrismaClient((db) => finishResearchReport(db, id, body.parts!));
    revalidatePath(`/projects/${id}`);
    return Response.json(res);
  }
  return Response.json({ error: "Unknown step." }, { status: 400 });
}
