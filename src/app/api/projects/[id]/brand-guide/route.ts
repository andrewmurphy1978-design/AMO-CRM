import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { finishBrandGuide, loadGuideSources } from "@/lib/brand-report";
import { GUIDE_PARTS, writeGuidePart, type GuideDoc } from "@/lib/brand-guide";

// The "Create the brand guide (PDF)" task's button, in small steps driven by the browser (a route rather
// than server actions: actions run one after the other, and the AI parts are written in parallel):
//   { step: "start" }                       checks the reports and the API key
//   { step: "part", lang, part }            one part of the guide, written by AI (a short request)
//   { step: "finish", guides: {en, fr} }    draws and saves the two PDFs, ticks the task
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await handle(request, params);
  } catch (err) {
    console.error("brand guide step failed", err);
    return Response.json({ error: `Server error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}` });
  }
}

async function handle(request: Request, params: Promise<{ id: string }>) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = (await request.json()) as { step?: string; lang?: "en" | "fr"; part?: number; guides?: { en: Partial<GuideDoc>[]; fr: Partial<GuideDoc>[] } };

  const contactId = await withScopedPrismaClient(async (db) => (await db.project.findUnique({ where: { id }, select: { contactId: true } }))?.contactId ?? null);
  if (!contactId) return Response.json({ error: "Project not found." });

  if (body.step === "start") {
    const res = await withScopedPrismaClient((db) => loadGuideSources(db, contactId));
    return Response.json("error" in res ? { error: res.error } : { parts: GUIDE_PARTS.length });
  }
  if (body.step === "part" && (body.lang === "en" || body.lang === "fr") && typeof body.part === "number") {
    const src = await withScopedPrismaClient((db) => loadGuideSources(db, contactId));
    if ("error" in src) return Response.json({ error: src.error });
    const res = await writeGuidePart({ ...src, lang: body.lang, part: body.part });
    return Response.json("error" in res ? { error: res.error } : { content: res });
  }
  if (body.step === "finish" && body.guides) {
    const res = await withScopedPrismaClient((db) => finishBrandGuide(db, contactId, id, body.guides!));
    revalidatePath(`/projects/${id}`);
    revalidatePath(`/contacts/${contactId}`);
    return Response.json(res);
  }
  return Response.json({ error: "Unknown step." }, { status: 400 });
}
