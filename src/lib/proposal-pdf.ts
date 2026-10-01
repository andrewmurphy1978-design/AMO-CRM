import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";

// Builds the client-facing Proposal PDF (A4): AMO logo and brand colours,
// project overview and detailed plan (current + upcoming phases), investment
// with taxes, instalment schedule, payment method, terms and acceptance.
// Pure pdf-lib (no native deps) so it runs on Cloudflare Workers.

export interface ProposalPdfData {
  lang: "en" | "fr";
  logoPng?: Uint8Array | null;
  number: string;
  title: string;
  date: Date;
  validDays: number;
  currency: string;
  company: { name: string; website: string; email?: string | null; gstNumber?: string | null; qstNumber?: string | null };
  client: { name: string; company?: string | null; email?: string | null; phone?: string | null; address?: string | null };
  project: { name: string; typeLabel: string; description?: string | null; startDate?: Date | null; dueDate?: Date | null };
  details: { label: string; value: string }[]; // custom-field answers
  coverLetter?: string | null;
  plan: { name: string; tasks: string[] }[]; // phases to deliver, in order
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  totals: { subtotal: number; gst: number; qst: number; hst: number; total: number };
  instalments: { label: string; percentage: number | null; amount: number; dueDate?: Date | null }[];
  notes?: string | null;
}

const GREEN = rgb(0x0d / 255, 0x2b / 255, 0x1a / 255);
const LIME = rgb(0x2e / 255, 0xcc / 255, 0x71 / 255);
const GOLD = rgb(0xf0 / 255, 0xc0 / 255, 0x40 / 255);
const MIST = rgb(0xf4 / 255, 0xfa / 255, 0xf6 / 255);
const INK = rgb(0.1, 0.15, 0.12);
const SOFT = rgb(0.38, 0.43, 0.4);
const RULE = rgb(0.85, 0.89, 0.87);

const W = 595.28;
const H = 841.89;
const MX = 48;
const CONTENT_W = W - MX * 2;
const TOP = H - 56;
const BOTTOM = 70;

const L = {
  en: {
    proposal: "PROPOSAL",
    preparedFor: "Prepared for",
    preparedBy: "Prepared by",
    date: "Date",
    validFor: (d: number) => `Valid for ${d} days`,
    number: "Proposal no.",
    overview: "Project overview",
    project: "Project",
    type: "Type",
    start: "Start",
    due: "Target completion",
    details: "Project details",
    plan: "Project plan & deliverables",
    planIntro: "The work is delivered in phases. Each phase begins when the previous one is complete, so you always know what is happening and what comes next.",
    phase: "Phase",
    investment: "Investment",
    description: "Description",
    qty: "Qty",
    unit: "Unit price",
    amount: "Amount",
    subtotal: "Subtotal",
    total: "Total",
    taxesNote: "Taxes are included in the instalment amounts below.",
    schedule: "Payment schedule",
    instalment: "Instalment",
    percent: "%",
    dueOn: "Due",
    payment: "Payment method",
    paymentBody:
      "A new invoice is issued for each instalment when it falls due, with payment instructions. Accepted methods (for example Interac e-Transfer and credit card) will be confirmed with your first invoice.",
    terms: "Terms & conditions",
    terms1: "Scope: the work described in this proposal. Changes to the scope are quoted separately before work begins.",
    terms2: "Revisions: a reasonable number of revision rounds are included; additional revisions are billed at the agreed hourly rate.",
    terms3: "Third-party costs: hosting, domains, software subscriptions (for example Systeme.io, Make, Zapier) and paid AI tools are billed separately.",
    terms4: "Payment: instalments are due as scheduled above. Work on the next phase begins once the previous instalment is received.",
    terms5: "Timelines depend on timely feedback and the supply of content and access by the client.",
    acceptance: "Acceptance",
    acceptBody: "By signing below, you accept this proposal and the payment schedule above.",
    clientSig: "Client signature",
    dateLine: "Date",
    printed: "Name",
    page: (n: number, t: number) => `Page ${n} of ${t}`,
    notes: "Notes",
    gst: "GST",
    qst: "QST",
    hst: "HST",
  },
  fr: {
    proposal: "PROPOSITION",
    preparedFor: "Préparé pour",
    preparedBy: "Préparé par",
    date: "Date",
    validFor: (d: number) => `Valide ${d} jours`,
    number: "Proposition no",
    overview: "Aperçu du projet",
    project: "Projet",
    type: "Type",
    start: "Début",
    due: "Livraison prévue",
    details: "Détails du projet",
    plan: "Plan du projet et livrables",
    planIntro: "Le travail est réalisé par phases. Chaque phase commence lorsque la précédente est terminée : vous savez toujours où en est le projet et ce qui suit.",
    phase: "Phase",
    investment: "Investissement",
    description: "Description",
    qty: "Qté",
    unit: "Prix unitaire",
    amount: "Montant",
    subtotal: "Sous-total",
    total: "Total",
    taxesNote: "Les taxes sont incluses dans les montants des versements ci-dessous.",
    schedule: "Calendrier de paiement",
    instalment: "Versement",
    percent: "%",
    dueOn: "Échéance",
    payment: "Mode de paiement",
    paymentBody:
      "Une nouvelle facture est émise pour chaque versement à son échéance, avec les instructions de paiement. Les modes acceptés (par exemple virement Interac et carte de crédit) seront confirmés avec votre première facture.",
    terms: "Conditions",
    terms1: "Portée : le travail décrit dans cette proposition. Tout changement de portée est soumis séparément avant le début des travaux.",
    terms2: "Révisions : un nombre raisonnable de rondes de révisions est inclus; les révisions additionnelles sont facturées au taux horaire convenu.",
    terms3: "Frais de tiers : l'hébergement, les domaines, les abonnements logiciels (par exemple Systeme.io, Make, Zapier) et les outils d'IA payants sont facturés séparément.",
    terms4: "Paiement : les versements sont dus selon le calendrier ci-dessus. La phase suivante débute à la réception du versement précédent.",
    terms5: "Les échéanciers dépendent de vos retours rapides et de la fourniture du contenu et des accès par le client.",
    acceptance: "Acceptation",
    acceptBody: "En signant ci-dessous, vous acceptez cette proposition et le calendrier de paiement ci-dessus.",
    clientSig: "Signature du client",
    dateLine: "Date",
    printed: "Nom",
    page: (n: number, t: number) => `Page ${n} de ${t}`,
    notes: "Notes",
    gst: "TPS",
    qst: "TVQ",
    hst: "TVH",
  },
};

// Standard PDF fonts only cover WinAnsi: keep Latin-1 and a few typographic
// characters, replace anything else.
const EXTRA_OK = new Set(["–", "—", "‘", "’", "“", "”", "•", "…", "€", "™"]);
function safe(text: string): string {
  let out = "";
  for (const ch of text.replace(/→/g, "->").replace(/[  ]/g, " ").replace(/[\r\t]/g, " ")) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || (code >= 32 && code <= 255) || EXTRA_OK.has(ch)) out += ch;
    else out += "?";
  }
  return out;
}

const money = (n: number, cur: string) => `${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
const fmtDate = (d: Date, lang: "en" | "fr") => d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

class Layout {
  page!: PDFPage;
  y = TOP;
  constructor(
    public doc: PDFDocument,
    public regular: PDFFont,
    public bold: PDFFont,
    public italic: PDFFont,
    public logo: PDFImage | null,
    public data: ProposalPdfData
  ) {}

  newPage(first = false) {
    this.page = this.doc.addPage([W, H]);
    if (!first) {
      // slim running header
      this.page.drawRectangle({ x: 0, y: H - 34, width: W, height: 34, color: GREEN });
      this.page.drawRectangle({ x: 0, y: H - 36, width: W, height: 2, color: GOLD });
      this.text(this.data.title, MX, H - 22, { size: 9, color: MIST, font: this.bold, maxWidth: CONTENT_W - 80 });
      this.text(this.data.number, W - MX - 70, H - 22, { size: 9, color: GOLD, font: this.bold });
      this.y = H - 66;
    }
  }

  text(t: string, x: number, y: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}) {
    const font = o.font ?? this.regular;
    const size = o.size ?? 10;
    let s = safe(t);
    if (o.maxWidth) while (s.length > 1 && font.widthOfTextAtSize(s, size) > o.maxWidth) s = s.slice(0, -1);
    this.page.drawText(s, { x, y, size, font, color: o.color ?? INK });
  }

  wrap(t: string, width: number, size: number, font: PDFFont): string[] {
    const lines: string[] = [];
    for (const para of safe(t).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= width) line = test;
        else {
          if (line) lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  ensure(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  gap(n: number) {
    this.y -= n;
  }

  heading(title: string) {
    this.ensure(46);
    this.gap(14);
    this.page.drawRectangle({ x: MX, y: this.y - 3, width: 4, height: 17, color: LIME });
    this.text(title, MX + 12, this.y, { size: 14, font: this.bold, color: GREEN });
    this.gap(10);
    this.page.drawLine({ start: { x: MX, y: this.y }, end: { x: W - MX, y: this.y }, thickness: 0.6, color: RULE });
    this.gap(14);
  }

  paragraph(t: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; leading?: number } = {}) {
    const size = o.size ?? 10;
    const leading = o.leading ?? size + 4;
    const indent = o.indent ?? 0;
    const font = o.font ?? this.regular;
    for (const line of this.wrap(t, CONTENT_W - indent, size, font)) {
      this.ensure(leading);
      this.text(line, MX + indent, this.y, { size, font, color: o.color });
      this.gap(leading);
    }
  }

  bullet(t: string, indent = 10) {
    const lines = this.wrap(t, CONTENT_W - indent - 12, 9.5, this.regular);
    lines.forEach((line, i) => {
      this.ensure(13);
      if (i === 0) this.page.drawCircle({ x: MX + indent + 3, y: this.y + 3, size: 1.6, color: LIME });
      this.text(line, MX + indent + 12, this.y, { size: 9.5 });
      this.gap(13);
    });
  }

  // Simple table: columns = [{ x offset, width, align }]
  table(
    cols: { header: string; width: number; align?: "left" | "right" }[],
    rows: string[][],
    opts: { boldLast?: boolean } = {}
  ) {
    const colX: number[] = [];
    let acc = MX + 8;
    for (const c of cols) {
      colX.push(acc);
      acc += c.width;
    }
    const drawHeader = () => {
      this.ensure(30);
      this.page.drawRectangle({ x: MX, y: this.y - 6, width: CONTENT_W, height: 20, color: GREEN });
      cols.forEach((c, i) => {
        const w = this.bold.widthOfTextAtSize(safe(c.header), 8.5);
        this.text(c.header.toUpperCase(), c.align === "right" ? colX[i] + c.width - 12 - w : colX[i], this.y, { size: 8.5, font: this.bold, color: MIST });
      });
      this.gap(22);
    };
    drawHeader();
    rows.forEach((row, ri) => {
      const wrapped = row.map((cell, i) => this.wrap(cell, cols[i].width - 12, 9.5, this.regular));
      const lines = Math.max(...wrapped.map((w) => w.length));
      const h = lines * 12 + 8;
      if (this.y - h < BOTTOM) {
        this.newPage();
        drawHeader();
      }
      if (ri % 2 === 0) this.page.drawRectangle({ x: MX, y: this.y - h + 9, width: CONTENT_W, height: h, color: MIST });
      const isLast = opts.boldLast && ri === rows.length - 1;
      wrapped.forEach((cellLines, i) => {
        cellLines.forEach((line, li) => {
          const font = isLast ? this.bold : this.regular;
          const w = font.widthOfTextAtSize(line, 9.5);
          this.text(line, cols[i].align === "right" ? colX[i] + cols[i].width - 12 - w : colX[i], this.y - li * 12, { size: 9.5, font });
        });
      });
      this.gap(h);
    });
    this.gap(6);
  }
}

export async function buildProposalPdf(data: ProposalPdfData): Promise<Uint8Array> {
  const t = L[data.lang];
  const doc = await PDFDocument.create();
  doc.setTitle(`${data.title} — ${data.company.name}`);
  doc.setAuthor(data.company.name);
  doc.setCreator(data.company.name);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  let logo: PDFImage | null = null;
  if (data.logoPng) {
    try {
      logo = await doc.embedPng(data.logoPng);
    } catch {
      logo = null;
    }
  }
  const lo = new Layout(doc, regular, bold, italic, logo, data);
  lo.newPage(true);

  // ---- cover band
  lo.page.drawRectangle({ x: 0, y: H - 190, width: W, height: 190, color: GREEN });
  lo.page.drawRectangle({ x: 0, y: H - 194, width: W, height: 4, color: GOLD });
  if (logo) {
    const h = 64;
    const w = (logo.width / logo.height) * h;
    lo.page.drawImage(logo, { x: MX, y: H - 40 - h, width: Math.min(w, 200), height: (Math.min(w, 200) / w) * h });
  } else {
    lo.text(data.company.name, MX, H - 70, { size: 18, font: bold, color: MIST });
  }
  lo.text(t.proposal, W - MX - bold.widthOfTextAtSize(t.proposal, 30), H - 70, { size: 30, font: bold, color: MIST });
  lo.text(`${t.number} ${data.number}`, W - MX - bold.widthOfTextAtSize(`${t.number} ${data.number}`, 10), H - 90, { size: 10, font: bold, color: GOLD });
  lo.text(fmtDate(data.date, data.lang), W - MX - regular.widthOfTextAtSize(safe(fmtDate(data.date, data.lang)), 10), H - 106, { size: 10, color: MIST });
  lo.text(t.validFor(data.validDays), W - MX - regular.widthOfTextAtSize(safe(t.validFor(data.validDays)), 10), H - 120, { size: 10, color: MIST });
  lo.text(data.title, MX, H - 160, { size: 16, font: bold, color: MIST, maxWidth: CONTENT_W });
  lo.text(data.project.name, MX, H - 178, { size: 10.5, color: GOLD, maxWidth: CONTENT_W });
  lo.y = H - 226;

  // ---- prepared for / by
  const colW = CONTENT_W / 2 - 8;
  const startY = lo.y;
  const block = (label: string, lines: string[], x: number) => {
    let y = startY;
    lo.text(label.toUpperCase(), x, y, { size: 8.5, font: bold, color: SOFT });
    y -= 15;
    lines.filter(Boolean).forEach((ln, i) => {
      for (const part of lo.wrap(ln, colW, i === 0 ? 11.5 : 9.5, i === 0 ? bold : regular)) {
        lo.text(part, x, y, { size: i === 0 ? 11.5 : 9.5, font: i === 0 ? bold : regular, color: i === 0 ? GREEN : INK });
        y -= i === 0 ? 15 : 13;
      }
    });
    return y;
  };
  const y1 = block(t.preparedFor, [data.client.name, data.client.company ?? "", data.client.email ?? "", data.client.phone ?? "", data.client.address ?? ""], MX);
  const y2 = block(t.preparedBy, [data.company.name, data.company.website, data.company.email ?? ""], MX + colW + 16);
  lo.y = Math.min(y1, y2) - 6;

  // ---- overview
  lo.heading(t.overview);
  const facts: [string, string][] = [
    [t.project, data.project.name],
    [t.type, data.project.typeLabel],
    ...(data.project.startDate ? ([[t.start, fmtDate(data.project.startDate, data.lang)]] as [string, string][]) : []),
    ...(data.project.dueDate ? ([[t.due, fmtDate(data.project.dueDate, data.lang)]] as [string, string][]) : []),
  ];
  for (const [k, v] of facts) {
    lo.ensure(14);
    lo.text(k, MX, lo.y, { size: 9.5, font: bold, color: SOFT });
    lo.text(v, MX + 120, lo.y, { size: 9.5, maxWidth: CONTENT_W - 120 });
    lo.gap(14);
  }
  if (data.coverLetter) {
    lo.gap(4);
    lo.paragraph(data.coverLetter, { size: 10 });
  }
  if (data.project.description) {
    lo.gap(4);
    lo.paragraph(data.project.description, { size: 10 });
  }

  if (data.details.length > 0) {
    lo.heading(t.details);
    for (const d of data.details) {
      const lines = lo.wrap(d.value, CONTENT_W - 150, 9.5, regular);
      lo.ensure(lines.length * 13 + 2);
      lo.text(d.label, MX, lo.y, { size: 9.5, font: bold, color: SOFT, maxWidth: 140 });
      lines.forEach((ln, i) => lo.text(ln, MX + 150, lo.y - i * 13, { size: 9.5 }));
      lo.gap(lines.length * 13 + 2);
    }
  }

  // ---- plan
  if (data.plan.length > 0) {
    lo.heading(t.plan);
    lo.paragraph(t.planIntro, { size: 9.5, color: SOFT, font: italic });
    lo.gap(4);
    data.plan.forEach((ph, i) => {
      lo.ensure(40);
      lo.page.drawRectangle({ x: MX, y: lo.y - 5, width: 22, height: 18, color: LIME });
      lo.text(String(i + 1), MX + (i + 1 > 9 ? 5 : 8), lo.y, { size: 10, font: bold, color: GREEN });
      lo.text(ph.name, MX + 32, lo.y, { size: 11.5, font: bold, color: GREEN, maxWidth: CONTENT_W - 40 });
      lo.gap(18);
      ph.tasks.forEach((tk) => lo.bullet(tk, 32));
      lo.gap(6);
    });
  }

  // ---- investment
  lo.heading(t.investment);
  const rows: string[][] = data.lineItems.map((li) => [li.description, String(li.quantity), money(li.unitPrice, data.currency), money(li.quantity * li.unitPrice, data.currency)]);
  lo.table(
    [
      { header: t.description, width: CONTENT_W - 8 - 40 - 100 - 100 },
      { header: t.qty, width: 40, align: "right" },
      { header: t.unit, width: 100, align: "right" },
      { header: t.amount, width: 100, align: "right" },
    ],
    rows
  );
  // totals block (right aligned)
  const totalsRows: [string, number, boolean][] = [[t.subtotal, data.totals.subtotal, false]];
  if (data.totals.gst) totalsRows.push([t.gst, data.totals.gst, false]);
  if (data.totals.qst) totalsRows.push([t.qst, data.totals.qst, false]);
  if (data.totals.hst) totalsRows.push([t.hst, data.totals.hst, false]);
  const grand = data.totals.subtotal + data.totals.total;
  totalsRows.push([t.total, grand, true]);
  for (const [label, amount, strong] of totalsRows) {
    lo.ensure(strong ? 36 : 16);
    if (strong) {
      lo.gap(6);
      lo.page.drawRectangle({ x: W - MX - 250, y: lo.y - 7, width: 250, height: 22, color: GREEN });
      lo.text(label, W - MX - 240, lo.y, { size: 11, font: bold, color: MIST });
      const v = money(amount, data.currency);
      lo.text(v, W - MX - 10 - bold.widthOfTextAtSize(safe(v), 11), lo.y, { size: 11, font: bold, color: GOLD });
      lo.gap(26);
    } else {
      lo.text(label, W - MX - 240, lo.y, { size: 9.5, color: SOFT });
      const v = money(amount, data.currency);
      lo.text(v, W - MX - 10 - regular.widthOfTextAtSize(safe(v), 9.5), lo.y, { size: 9.5 });
      lo.gap(15);
    }
  }
  if (data.totals.total > 0) lo.paragraph(t.taxesNote, { size: 8.5, color: SOFT, font: italic });

  // ---- schedule
  if (data.instalments.length > 0) {
    lo.heading(t.schedule);
    lo.table(
      [
        { header: "#", width: 24 },
        { header: t.instalment, width: CONTENT_W - 8 - 24 - 50 - 110 - 120 },
        { header: t.percent, width: 50, align: "right" },
        { header: t.amount, width: 110, align: "right" },
        { header: t.dueOn, width: 120 },
      ],
      data.instalments.map((r, i) => [
        String(i + 1),
        r.label,
        r.percentage != null ? `${r.percentage}%` : "",
        money(r.amount, data.currency),
        r.dueDate ? fmtDate(r.dueDate, data.lang) : "",
      ])
    );
  }

  // ---- payment method
  lo.heading(t.payment);
  lo.paragraph(t.paymentBody, { size: 10 });

  if (data.notes) {
    lo.heading(t.notes);
    lo.paragraph(data.notes);
  }

  // ---- terms
  lo.heading(t.terms);
  for (const term of [t.terms1, t.terms2, t.terms3, t.terms4, t.terms5]) lo.bullet(term, 4);

  // ---- acceptance
  lo.ensure(150);
  lo.heading(t.acceptance);
  lo.paragraph(t.acceptBody, { size: 10 });
  lo.gap(34);
  const sigY = lo.y;
  lo.page.drawLine({ start: { x: MX, y: sigY }, end: { x: MX + 250, y: sigY }, thickness: 0.8, color: INK });
  lo.page.drawLine({ start: { x: MX + 290, y: sigY }, end: { x: W - MX, y: sigY }, thickness: 0.8, color: INK });
  lo.text(t.clientSig, MX, sigY - 12, { size: 8.5, color: SOFT });
  lo.text(t.dateLine, MX + 290, sigY - 12, { size: 8.5, color: SOFT });
  lo.gap(40);
  lo.page.drawLine({ start: { x: MX, y: lo.y }, end: { x: MX + 250, y: lo.y }, thickness: 0.8, color: INK });
  lo.text(t.printed, MX, lo.y - 12, { size: 8.5, color: SOFT });

  // ---- footers
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    pg.drawRectangle({ x: 0, y: 0, width: W, height: 40, color: GREEN });
    pg.drawRectangle({ x: 0, y: 40, width: W, height: 2, color: GOLD });
    const left = [data.company.name, data.company.website].filter(Boolean).join("  ·  ");
    pg.drawText(safe(left), { x: MX, y: 22, size: 8.5, font: regular, color: MIST });
    const taxIds = [data.company.gstNumber ? `${t.gst} ${data.company.gstNumber}` : "", data.company.qstNumber ? `${t.qst} ${data.company.qstNumber}` : ""].filter(Boolean).join("  ·  ");
    if (taxIds) pg.drawText(safe(taxIds), { x: MX, y: 10, size: 7.5, font: regular, color: GOLD });
    const label = safe(t.page(i + 1, pages.length));
    pg.drawText(label, { x: W - MX - regular.widthOfTextAtSize(label, 8.5), y: 22, size: 8.5, font: regular, color: MIST });
  });

  return doc.save();
}

// ------------------------------------------------------------------ invoice

export interface InvoicePdfData {
  lang: "en" | "fr";
  logoPng?: Uint8Array | null;
  number: string;
  date: Date;
  dueDate?: Date | null;
  paidAt?: Date | null;
  currency: string;
  company: ProposalPdfData["company"];
  client: ProposalPdfData["client"];
  projectName: string;
  instalmentLabel?: string | null; // e.g. "Instalment 2 of 3 — Approval"
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  totals: { subtotal: number; gst: number; qst: number; hst: number; total: number };
  notes?: string | null;
}

const LI = {
  en: { invoice: "INVOICE", billTo: "Billed to", from: "From", issued: "Issued", due: "Due", paid: "PAID", project: "Project", payment: "How to pay",
    paymentBody: "Please pay by the due date using the method agreed in your proposal (for example Interac e-Transfer or credit card). Payment details will be confirmed with this invoice; reply to this email if you need them again.",
    thanks: "Thank you for your business.", amountDue: "Amount due", subtotal: "Subtotal", description: "Description", qty: "Qty", unit: "Unit price", amount: "Amount", notes: "Notes", gst: "GST", qst: "QST", hst: "HST", page: (n: number, t: number) => `Page ${n} of ${t}` },
  fr: { invoice: "FACTURE", billTo: "Facturé à", from: "De", issued: "Émise le", due: "Échéance", paid: "PAYÉE", project: "Projet", payment: "Comment payer",
    paymentBody: "Veuillez payer d'ici l'échéance selon le mode convenu dans votre proposition (par exemple virement Interac ou carte de crédit). Les détails de paiement seront confirmés avec cette facture; répondez à ce courriel si vous en avez besoin à nouveau.",
    thanks: "Merci de votre confiance.", amountDue: "Montant dû", subtotal: "Sous-total", description: "Description", qty: "Qté", unit: "Prix unitaire", amount: "Montant", notes: "Notes", gst: "TPS", qst: "TVQ", hst: "TVH", page: (n: number, t: number) => `Page ${n} de ${t}` },
};

export async function buildInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const t = LI[data.lang];
  const doc = await PDFDocument.create();
  doc.setTitle(`${t.invoice} ${data.number}`);
  doc.setAuthor(data.company.name);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  let logo: PDFImage | null = null;
  if (data.logoPng) {
    try {
      logo = await doc.embedPng(data.logoPng);
    } catch {
      logo = null;
    }
  }
  const asProposal = { title: `${t.invoice} ${data.number}`, number: data.number } as ProposalPdfData;
  const lo = new Layout(doc, regular, bold, italic, logo, asProposal);
  lo.newPage(true);

  lo.page.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: GREEN });
  lo.page.drawRectangle({ x: 0, y: H - 154, width: W, height: 4, color: GOLD });
  if (logo) {
    const h = 58;
    const w = Math.min((logo.width / logo.height) * h, 190);
    lo.page.drawImage(logo, { x: MX, y: H - 36 - h, width: w, height: (w / logo.width) * logo.height });
  } else {
    lo.text(data.company.name, MX, H - 70, { size: 18, font: bold, color: MIST });
  }
  lo.text(t.invoice, W - MX - bold.widthOfTextAtSize(t.invoice, 28), H - 66, { size: 28, font: bold, color: MIST });
  const num = `#${data.number}`;
  lo.text(num, W - MX - bold.widthOfTextAtSize(safe(num), 11), H - 86, { size: 11, font: bold, color: GOLD });
  const issued = `${t.issued} ${fmtDate(data.date, data.lang)}`;
  lo.text(issued, W - MX - regular.widthOfTextAtSize(safe(issued), 9.5), H - 104, { size: 9.5, color: MIST });
  if (data.dueDate) {
    const due = `${t.due} ${fmtDate(data.dueDate, data.lang)}`;
    lo.text(due, W - MX - bold.widthOfTextAtSize(safe(due), 9.5), H - 118, { size: 9.5, font: bold, color: MIST });
  }
  if (data.paidAt) {
    lo.page.drawRectangle({ x: MX, y: H - 138, width: 70, height: 20, color: LIME });
    lo.text(t.paid, MX + 18, H - 132, { size: 11, font: bold, color: GREEN });
  }
  lo.y = H - 190;

  const colW = CONTENT_W / 2 - 8;
  const startY = lo.y;
  const block = (label: string, lines: string[], x: number) => {
    let y = startY;
    lo.text(label.toUpperCase(), x, y, { size: 8.5, font: bold, color: SOFT });
    y -= 15;
    lines.filter(Boolean).forEach((ln, i) => {
      for (const part of lo.wrap(ln, colW, i === 0 ? 11.5 : 9.5, i === 0 ? bold : regular)) {
        lo.text(part, x, y, { size: i === 0 ? 11.5 : 9.5, font: i === 0 ? bold : regular, color: i === 0 ? GREEN : INK });
        y -= i === 0 ? 15 : 13;
      }
    });
    return y;
  };
  const y1 = block(t.billTo, [data.client.name, data.client.company ?? "", data.client.email ?? "", data.client.address ?? ""], MX);
  const y2 = block(t.from, [data.company.name, data.company.website, data.company.email ?? ""], MX + colW + 16);
  lo.y = Math.min(y1, y2) - 8;

  lo.text(t.project, MX, lo.y, { size: 9.5, font: bold, color: SOFT });
  lo.text(data.projectName, MX + 70, lo.y, { size: 10, maxWidth: CONTENT_W - 70 });
  lo.gap(16);
  if (data.instalmentLabel) {
    lo.text(data.instalmentLabel, MX, lo.y, { size: 11, font: bold, color: GREEN, maxWidth: CONTENT_W });
    lo.gap(16);
  }
  lo.gap(4);
  lo.table(
    [
      { header: t.description, width: CONTENT_W - 8 - 40 - 100 - 100 },
      { header: t.qty, width: 40, align: "right" },
      { header: t.unit, width: 100, align: "right" },
      { header: t.amount, width: 100, align: "right" },
    ],
    data.lineItems.map((li) => [li.description, String(li.quantity), money(li.unitPrice, data.currency), money(li.quantity * li.unitPrice, data.currency)])
  );
  const rows: [string, number, boolean][] = [[t.subtotal, data.totals.subtotal, false]];
  if (data.totals.gst) rows.push([t.gst, data.totals.gst, false]);
  if (data.totals.qst) rows.push([t.qst, data.totals.qst, false]);
  if (data.totals.hst) rows.push([t.hst, data.totals.hst, false]);
  rows.push([t.amountDue, data.totals.subtotal + data.totals.total, true]);
  for (const [label, amount, strong] of rows) {
    lo.ensure(strong ? 36 : 16);
    const v = money(amount, data.currency);
    if (strong) {
      lo.gap(6);
      lo.page.drawRectangle({ x: W - MX - 250, y: lo.y - 7, width: 250, height: 22, color: GREEN });
      lo.text(label, W - MX - 240, lo.y, { size: 11, font: bold, color: MIST });
      lo.text(v, W - MX - 10 - bold.widthOfTextAtSize(safe(v), 11), lo.y, { size: 11, font: bold, color: GOLD });
      lo.gap(28);
    } else {
      lo.text(label, W - MX - 240, lo.y, { size: 9.5, color: SOFT });
      lo.text(v, W - MX - 10 - regular.widthOfTextAtSize(safe(v), 9.5), lo.y, { size: 9.5 });
      lo.gap(15);
    }
  }
  lo.heading(t.payment);
  lo.paragraph(t.paymentBody);
  if (data.notes) {
    lo.heading(t.notes);
    lo.paragraph(data.notes);
  }
  lo.gap(8);
  lo.paragraph(t.thanks, { font: italic, color: SOFT });

  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    pg.drawRectangle({ x: 0, y: 0, width: W, height: 40, color: GREEN });
    pg.drawRectangle({ x: 0, y: 40, width: W, height: 2, color: GOLD });
    pg.drawText(safe([data.company.name, data.company.website].filter(Boolean).join("  ·  ")), { x: MX, y: 22, size: 8.5, font: regular, color: MIST });
    const taxIds = [data.company.gstNumber ? `${t.gst} ${data.company.gstNumber}` : "", data.company.qstNumber ? `${t.qst} ${data.company.qstNumber}` : ""].filter(Boolean).join("  ·  ");
    if (taxIds) pg.drawText(safe(taxIds), { x: MX, y: 10, size: 7.5, font: regular, color: GOLD });
    const label = safe(t.page(i + 1, pages.length));
    pg.drawText(label, { x: W - MX - regular.widthOfTextAtSize(label, 8.5), y: 22, size: 8.5, font: regular, color: MIST });
  });
  return doc.save();
}
