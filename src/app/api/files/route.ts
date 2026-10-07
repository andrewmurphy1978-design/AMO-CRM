import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { importBrandZip, processBrandReport, tickBrandPhaseTasks, type BrandReportResult } from "@/lib/brand-report";
import { importResearchZip, processResearchReport, type ResearchResult } from "@/lib/research-report";
import { importMockupZip, processMockupReport, tickMockupTasks, type MockupResult } from "@/lib/mockup-files";
import { revalidatePath } from "next/cache";

export const MAX_FILE_BYTES = 10_000_000;

// POST /api/files  (multipart form: one or more "file" parts + "contactId" or "projectId")
// Stores the files on that Contact or Project (the File card).
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const form = await request.formData();
  const contactId = String(form.get("contactId") ?? "") || null;
  const projectId = String(form.get("projectId") ?? "") || null;
  // BRAND_REPORT: the AI brand report (Brand card); RESEARCH_REPORT: an AI research report (Research card)
  // MOCKUP_REPORT: an AI mock-up report or its images zip (Mock-ups card)
  const rawKind = form.get("kind");
  const kind = rawKind === "BRAND_REPORT" ? "BRAND_REPORT" : rawKind === "RESEARCH_REPORT" ? "RESEARCH_REPORT" : rawKind === "MOCKUP_REPORT" ? "MOCKUP_REPORT" : null;
  if (!contactId === !projectId) return Response.json({ error: "Give either a contact or a project." }, { status: 400 });
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (files.length === 0) return Response.json({ error: "No file." }, { status: 400 });

  const saved: string[] = [];
  const problems: string[] = [];
  let brand: BrandReportResult | null = null;
  let brandNote = "";
  let zipResult: { added: number; skipped: string[] } | null = null;
  let research: ResearchResult | null = null;
  let mockup: MockupResult | null = null;
  await withScopedPrismaClient(async (db) => {
    for (const f of files) {
      if (f.size === 0) {
        problems.push(`${f.name}: empty file`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        problems.push(`${f.name}: over ${MAX_FILE_BYTES / 1_000_000} MB`);
        continue;
      }
      const bytes = new Uint8Array(await f.arrayBuffer());
      const row = await db.attachedFile.create({
        data: { contactId, projectId, name: f.name.slice(0, 200) || "file", mimeType: f.type || "application/octet-stream", size: bytes.length, data: bytes as never, uploadedByName: session.user.name ?? null, kind },
        select: { id: true },
      });
      saved.push(row.id);
      // An AI brand report in Markdown: check it, tick the Brand tasks it covers, make the PDF guide.
      // An AI research report (Markdown) or its screenshots zip, on the project's Research card.
      if (kind === "RESEARCH_REPORT" && projectId) {
        if (/\.(md|markdown|txt)$/i.test(f.name)) {
          try {
            research = await processResearchReport(db, projectId, new TextDecoder("utf-8").decode(bytes));
          } catch (err) {
            console.error("research report not processed", err);
            problems.push(`${f.name}: could not be read`);
          }
        } else if (/\.zip$/i.test(f.name)) {
          try {
            const z = await importResearchZip(db, projectId, bytes);
            zipResult = { added: (zipResult?.added ?? 0) + z.added, skipped: [...(zipResult?.skipped ?? []), ...z.skipped] };
            await db.attachedFile.delete({ where: { id: row.id } }); // the screenshots are kept one by one
            saved.pop();
          } catch (err) {
            console.error("research zip not read", err);
            problems.push(`${f.name}: could not be opened as a zip`);
          }
        } else brandNote = "Only a Markdown (.md) report can be checked, and only a .zip's PNG / JPG screenshots are kept.";
      }
      // An AI mock-up report (Markdown) or its images zip, on the project's Mock-ups card.
      if (kind === "MOCKUP_REPORT" && projectId) {
        if (/\.(md|markdown|txt)$/i.test(f.name)) {
          try {
            const r = await processMockupReport(db, projectId, new TextDecoder("utf-8").decode(bytes));
            mockup = { sections: [...new Set([...(mockup?.sections ?? []), ...r.sections])], verified: [...(mockup?.verified ?? []), ...r.verified] };
          } catch (err) {
            console.error("mockup report not processed", err);
            problems.push(`${f.name}: could not be read`);
          }
        } else if (/\.zip$/i.test(f.name)) {
          try {
            const z = await importMockupZip(db, projectId, bytes);
            zipResult = { added: (zipResult?.added ?? 0) + z.added, skipped: [...(zipResult?.skipped ?? []), ...z.skipped] };
            const verified = await tickMockupTasks(db, projectId, z.types);
            mockup = { sections: mockup?.sections ?? [], verified: [...(mockup?.verified ?? []), ...verified] };
            await db.attachedFile.delete({ where: { id: row.id } }); // the images are kept one by one
            saved.pop();
          } catch (err) {
            console.error("mockup zip not read", err);
            problems.push(`${f.name}: could not be opened as a zip`);
          }
        } else brandNote = "Only a Markdown (.md) report and a .zip of PNG / JPG images are used.";
      }
      if (kind === "BRAND_REPORT" && contactId) {
        if (/\.(md|markdown|txt)$/i.test(f.name)) {
          try {
            brand = await processBrandReport(db, contactId, new TextDecoder("utf-8").decode(bytes));
          } catch (err) {
            console.error("brand report not processed", err);
            problems.push(`${f.name}: could not be read`);
          }
        } else if (/\.zip$/i.test(f.name)) {
          // The AI's brand-assets.zip: its images join the Brand card.
          try {
            const z = await importBrandZip(db, contactId, bytes);
            zipResult = { added: (zipResult?.added ?? 0) + z.added, skipped: [...(zipResult?.skipped ?? []), ...z.skipped] };
            // New elements on the Brand card: the "Add the brand to the client's Brand card" task is done.
            if (z.added > 0) await tickBrandPhaseTasks(db, contactId, /^add the brand to the client's brand card/i);
          } catch (err) {
            console.error("brand zip not read", err);
            problems.push(`${f.name}: could not be opened as a zip`);
          }
        } else brandNote = "Only a Markdown (.md) report can be checked, and only a .zip's images are added to the Brand card.";
      }
    }
  });
  if ((brand || zipResult) && contactId) revalidatePath(`/contacts/${contactId}`);
  if ((research || mockup || zipResult) && projectId) revalidatePath(`/projects/${projectId}`);
  return Response.json({ saved: saved.length, problems, brand, brandNote, zip: zipResult, research, mockup });
}
