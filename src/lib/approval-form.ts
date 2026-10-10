import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { PrismaClient } from "@/lib/prisma";
import { ok } from "@/lib/research-report";

// The approval form: one page listing every report presented to the client (brand guides, research reports,
// each mock-up) with Approved / Changes requested boxes and a signature block per approver, in the client's
// language. It is made when the mock-up report is created and sent with the reports.

const FR_NAMES: Record<string, string> = {
  "brand guides": "Guides de marque",
  "research reports": "Rapports de recherche",
  "website mock-up": "Maquette du site web",
  "funnel mock-up": "Maquette de l'entonnoir",
  "blog mock-up": "Maquette du blogue",
  "app mock-up": "Maquette de l'application",
  "mock-up": "Maquette",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const T = {
  en: {
    title: "Approval of the deliverables",
    client: "Client",
    project: "Project",
    date: "Date",
    intro: "The deliverables listed below were presented to me. By signing this page I confirm that I have reviewed them and that I approve them, except for the changes I mark below, so that the next step, the building of the project, can start.",
    deliverable: "Deliverable",
    approved: "Approved",
    changes: "Changes requested",
    comments: "Comments",
    name: "Name",
    signature: "Signature",
    signedOn: "Date",
    prepared: "Prepared by Andrew Murphy Online",
  },
  fr: {
    title: "Approbation des livrables",
    client: "Client",
    project: "Projet",
    date: "Date",
    intro: "Les livrables ci-dessous m'ont été présentés. En signant cette page, je confirme les avoir examinés et les approuver, sauf les modifications que j'indique ci-dessous, afin que l'étape suivante, la réalisation du projet, puisse commencer.",
    deliverable: "Livrable",
    approved: "Approuvé",
    changes: "Modifications demandées",
    comments: "Commentaires",
    name: "Nom",
    signature: "Signature",
    signedOn: "Date",
    prepared: "Préparé par Andrew Murphy Online",
  },
} as const;

export async function createApprovalForm(db: PrismaClient, projectId: string): Promise<string | null> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, contact: { select: { firstName: true, lastName: true, company: true, locale: true } }, phases: { select: { name: true, tasks: { select: { title: true } } } }, pendingPhases: true },
  });
  if (!p) return null;
  const lang: "en" | "fr" = (p.contact.locale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";
  const t = T[lang];
  const clientName = p.contact.company || [p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") || "Client";
  const person = [p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ");

  // What is presented, and who approves it: the "Present the …" / "Get approval of … (Name)" tasks of the presenting phase.
  const phase = p.phases.find((ph) => /^(2nd instalment|present the reports( and mock-ups)?)$/i.test(ph.name.trim()));
  const pending = (Array.isArray(p.pendingPhases) ? p.pendingPhases : []) as { name?: string; tasks?: string[] }[];
  const titles = phase ? phase.tasks.map((x) => x.title) : (pending.find((ph) => /^(2nd instalment|present the reports( and mock-ups)?)$/i.test((ph.name ?? "").trim()))?.tasks ?? []).map(String);
  let items = titles.map((x) => /^present (?:the )?(.+)$/i.exec(x.trim())?.[1]).filter((x): x is string => Boolean(x) && !/^\(send\)/i.test(x ?? ""));
  if (items.length === 0) items = ["brand guides", "research reports", "mock-up"];
  const approvers = [...new Set(titles.filter((x) => /^get /i.test(x)).map((x) => /\(([^()]+)\)\s*$/.exec(x)?.[1]?.trim()).filter((x): x is string => Boolean(x)))];
  const signers = approvers.length > 0 ? approvers : [person || clientName];

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595;
  const H = 842;
  const MX = 54;
  const CW = W - 2 * MX;
  const GREEN = rgb(0.06, 0.16, 0.11);
  const ACCENT = rgb(0.31, 0.76, 0.35);
  const INK = rgb(0.1, 0.11, 0.1);
  const SOFT = rgb(0.4, 0.43, 0.41);
  const LINE = rgb(0.75, 0.78, 0.76);
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    let line = "";
    for (const w of ok(text).split(" ")) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= width) line = test;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    lines.push(line);
    return lines;
  };
  let page = pdf.addPage([W, H]);
  const header = () => {
    page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: GREEN });
    page.drawRectangle({ x: 0, y: H - 82, width: W, height: 4, color: ACCENT });
    page.drawText(ok(t.title), { x: MX, y: H - 52, size: 22, font: bold, color: rgb(1, 1, 1) });
    page.drawLine({ start: { x: MX, y: 36 }, end: { x: W - MX, y: 36 }, thickness: 0.5, color: LINE });
    page.drawText(ok(`${clientName}  -  ${t.prepared}`), { x: MX, y: 22, size: 8, font: regular, color: SOFT });
  };
  header();
  let y = H - 118;
  const ensure = (h: number) => {
    if (y - h < 60) {
      page = pdf.addPage([W, H]);
      header();
      y = H - 118;
    }
  };
  for (const [k, v] of [[t.client, clientName], [t.project, p.name], [t.date, new Date().toISOString().slice(0, 10)]] as const) {
    page.drawText(ok(k), { x: MX, y, size: 9, font: bold, color: SOFT });
    page.drawText(ok(v).slice(0, 80), { x: MX + 70, y, size: 11, font: regular, color: INK });
    y -= 18;
  }
  y -= 8;
  for (const ln of wrap(t.intro, regular, 10.5, CW)) {
    page.drawText(ln, { x: MX, y, size: 10.5, font: regular, color: INK });
    y -= 15;
  }
  y -= 12;
  // table
  const c1 = CW - 190;
  const head = (x: number, label: string) => page.drawText(ok(label), { x, y: y - 14, size: 9, font: bold, color: GREEN });
  page.drawRectangle({ x: MX, y: y - 22, width: CW, height: 24, color: rgb(0.93, 0.96, 0.94) });
  head(MX + 6, t.deliverable);
  head(MX + c1 + 8, t.approved);
  head(MX + c1 + 82, lang === "fr" ? "Modifications" : t.changes.slice(0, 18));
  y -= 24;
  for (const item of items) {
    const label = lang === "fr" ? (FR_NAMES[item.toLowerCase()] ?? cap(item)) : cap(item);
    const lines = wrap(label, regular, 10.5, c1 - 12);
    const h = Math.max(30, lines.length * 14 + 14);
    ensure(h + 4);
    lines.forEach((ln, i) => page.drawText(ln, { x: MX + 6, y: y - 18 - i * 14, size: 10.5, font: regular, color: INK }));
    page.drawRectangle({ x: MX + c1 + 22, y: y - h / 2 - 7, width: 14, height: 14, borderColor: GREEN, borderWidth: 1 });
    page.drawRectangle({ x: MX + c1 + 98, y: y - h / 2 - 7, width: 14, height: 14, borderColor: GREEN, borderWidth: 1 });
    page.drawLine({ start: { x: MX, y: y - h }, end: { x: W - MX, y: y - h }, thickness: 0.4, color: LINE });
    y -= h;
  }
  y -= 18;
  ensure(120);
  page.drawText(ok(t.comments), { x: MX, y, size: 9, font: bold, color: SOFT });
  for (let i = 1; i <= 3; i++) page.drawLine({ start: { x: MX, y: y - i * 22 }, end: { x: W - MX, y: y - i * 22 }, thickness: 0.4, color: LINE });
  y -= 100;
  for (const who of signers) {
    ensure(100);
    page.drawText(ok(`${t.name}: ${who}`), { x: MX, y, size: 10.5, font: regular, color: INK });
    page.drawText(ok(`${t.signature}:`), { x: MX, y: y - 40, size: 9, font: bold, color: SOFT });
    page.drawLine({ start: { x: MX + 62, y: y - 42 }, end: { x: MX + 330, y: y - 42 }, thickness: 0.6, color: INK });
    page.drawText(ok(`${t.signedOn}:`), { x: MX + 350, y: y - 40, size: 9, font: bold, color: SOFT });
    page.drawLine({ start: { x: MX + 385, y: y - 42 }, end: { x: W - MX, y: y - 42 }, thickness: 0.6, color: INK });
    y -= 90;
  }
  const bytes = await pdf.save();
  const base = `${clientName}-${p.name}`.replace(/[^\w.-]+/g, "-");
  const name = `Approval-form-${base}-${lang === "fr" ? "FR" : "EN"}.pdf`;
  await db.attachedFile.deleteMany({ where: { projectId, kind: "APPROVAL_PDF" } });
  await db.attachedFile.create({
    data: { projectId, kind: "APPROVAL_PDF", name, mimeType: "application/pdf", size: bytes.length, data: bytes as never, uploadedByName: "AMO CRM", note: `Approval and signature page (${lang === "fr" ? "French" : "English"}) for the reports presented` },
  });
  return name;
}
