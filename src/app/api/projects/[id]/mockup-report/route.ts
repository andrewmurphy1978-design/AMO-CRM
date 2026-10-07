import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { finishMockupReport, loadMockupSources, writeMockupPart, type MockupDoc } from "@/lib/mockup-report";

// The Mock-ups card's "Create the final report" button, in small steps driven by the browser (see the research report):
//   { step: "start" } / { step: "part", lang, part } / { step: "finish", parts: {en, fr} }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await handle(request, params);
  } catch (err) {
    console.error("mockup report step failed", err);
    return Response.json({ error: `Server error: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}` });
  }
}

async function handle(request: Request, params: Promise<{ id: string }>) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = (await request.json()) as { step?: string; lang?: "en" | "fr"; part?: number; parts?: { en: Partial<MockupDoc>[]; fr: Partial<MockupDoc>[] } };

  if (body.step === "start") {
    const res = await withScopedPrismaClient((db) => loadMockupSources(db, id));
    return Response.json("error" in res ? { error: res.error } : { parts: res.types.length + 1 });
  }
  if (body.step === "part" && (body.lang === "en" || body.lang === "fr") && typeof body.part === "number") {
    const src = await withScopedPrismaClient((db) => loadMockupSources(db, id));
    if ("error" in src) return Response.json({ error: src.error });
    const res = await writeMockupPart({ ...src, lang: body.lang, part: body.part });
    return Response.json("error" in res ? { error: res.error } : { content: res });
  }
  if (body.step === "finish" && body.parts && (body.lang === "en" || body.lang === "fr")) {
    const lang = body.lang;
    const res = await withScopedPrismaClient((db) => finishMockupReport(db, id, lang, body.parts![lang]));
    revalidatePath(`/projects/${id}`);
    return Response.json(res);
  }
  return Response.json({ error: "Unknown step." }, { status: 400 });
}
