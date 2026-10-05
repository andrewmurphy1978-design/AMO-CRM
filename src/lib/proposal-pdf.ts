import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";

// Builds the client-facing Proposal PDF (A4): AMO logo and brand colours,
// project overview and detailed plan (current + upcoming phases), investment
// with taxes, instalment schedule, payment method, terms and acceptance.
// Pure pdf-lib (no native deps) so it runs on Cloudflare Workers.

export interface PdfAttachment {
  label: string; // e.g. "Supplier invoice — GoDaddy #123"
  mime: string;
  data: Uint8Array;
}

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
  project: { name: string; typeLabel: string; typeLabels?: string[]; description?: string | null; startDate?: Date | null; dueDate?: Date | null };
  details: { label: string; value: string; group?: string }[]; // custom-field answers (grouped by type)
  coverLetter?: string | null;
  plan: { name: string; tasks: string[] }[]; // phases to deliver, in order
  lineItems: { description: string; details?: string | null; quantity: number; unitPrice: number }[];
  subscriptions?: { name: string; amount: number; period: string; note: string }[];
  supplierCosts?: { supplier: string; reference?: string | null; description?: string | null; total: number; currency: string }[];
  attachments?: PdfAttachment[];
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
    types: "Types",
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
    subsTitle: "Apps & subscription fees",
    subsNote: "Paid directly to each provider; not included in the total above.",
    service: "Service",
    billing: "Billing",
    note: "Note",
    perMonth: "/ month",
    perYear: "/ year",
    oneTime: "one-time",
    subsEstimate: "Estimated recurring",
    supplierTitle: "Supplier costs paid on your behalf",
    supplierNote: "Billed at cost, with the supplier's taxes, in addition to the total above. The supplier invoices are attached.",
    attachments: "Attachments",
    tagline: "AI  ·  FUNNELS  ·  WEBSITES  ·  AUTOMATION",
  },
  fr: {
    proposal: "SOUMISSION",
    preparedFor: "Préparé pour",
    preparedBy: "Préparé par",
    date: "Date",
    validFor: (d: number) => `Valide ${d} jours`,
    number: "Soumission no",
    overview: "Aperçu du projet",
    project: "Projet",
    type: "Type",
    types: "Types",
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
    terms1: "Portée : le travail décrit dans cette soumission. Tout changement de portée est soumis séparément avant le début des travaux.",
    terms2: "Révisions : un nombre raisonnable de rondes de révisions est inclus; les révisions additionnelles sont facturées au taux horaire convenu.",
    terms3: "Frais de tiers : l'hébergement, les domaines, les abonnements logiciels (par exemple Systeme.io, Make, Zapier) et les outils d'IA payants sont facturés séparément.",
    terms4: "Paiement : les versements sont dus selon le calendrier ci-dessus. La phase suivante débute à la réception du versement précédent.",
    terms5: "Les échéanciers dépendent de vos retours rapides et de la fourniture du contenu et des accès par le client.",
    acceptance: "Acceptation",
    acceptBody: "En signant ci-dessous, vous acceptez cette soumission et le calendrier de paiement ci-dessus.",
    clientSig: "Signature du client",
    dateLine: "Date",
    printed: "Nom",
    page: (n: number, t: number) => `Page ${n} de ${t}`,
    notes: "Notes",
    gst: "TPS",
    qst: "TVQ",
    hst: "TVH",
    subsTitle: "Applications et abonnements",
    subsNote: "Payés directement à chaque fournisseur; non inclus dans le total ci-dessus.",
    service: "Service",
    billing: "Facturation",
    note: "Note",
    perMonth: "/ mois",
    perYear: "/ an",
    oneTime: "une fois",
    subsEstimate: "Récurrent estimé",
    supplierTitle: "Frais de fournisseurs payés en votre nom",
    supplierNote: "Facturés au coût, avec les taxes du fournisseur, en plus du total ci-dessus. Les factures des fournisseurs sont jointes.",
    attachments: "Pièces jointes",
    tagline: "IA  ·  TUNNELS  ·  SITES WEB  ·  AUTOMATISATION",
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

async function appendAttachments(doc: PDFDocument, fonts: { regular: PDFFont; bold: PDFFont }, title: string, items: PdfAttachment[]) {
  if (items.length === 0) return;
  const divider = doc.addPage([W, H]);
  divider.drawRectangle({ x: 0, y: H - 120, width: W, height: 120, color: GREEN });
  divider.drawRectangle({ x: 0, y: H - 124, width: W, height: 4, color: GOLD });
  divider.drawText(safe(title), { x: MX, y: H - 78, size: 26, font: fonts.bold, color: MIST });
  let y = H - 170;
  items.forEach((it, i) => {
    divider.drawText(safe(`${i + 1}.  ${it.label}`), { x: MX, y, size: 11, font: fonts.regular, color: INK, maxWidth: CONTENT_W } as never);
    y -= 20;
  });
  for (const it of items) {
    try {
      if (/pdf/i.test(it.mime)) {
        const src = await PDFDocument.load(it.data, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((pg) => doc.addPage(pg));
      } else if (/png/i.test(it.mime) || /jpe?g/i.test(it.mime)) {
        const img = /png/i.test(it.mime) ? await doc.embedPng(it.data) : await doc.embedJpg(it.data);
        const page = doc.addPage([W, H]);
        const scale = Math.min((W - 80) / img.width, (H - 120) / img.height, 1);
        page.drawText(safe(it.label), { x: 40, y: H - 40, size: 10, font: fonts.bold, color: SOFT });
        page.drawImage(img, { x: 40, y: H - 70 - img.height * scale, width: img.width * scale, height: img.height * scale });
      }
    } catch {
      // an unreadable file is skipped rather than failing the whole document
    }
  }
}

const money = (n: number, cur: string) => `${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
const fmtDate = (d: Date, lang: "en" | "fr") => d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

// A page that swallows every drawing call: used to measure a section's height before drawing it.
const NOOP_PAGE = new Proxy({}, { get: () => () => undefined }) as unknown as PDFPage;

class Layout {
  page!: PDFPage;
  y = TOP;
  dry = false;
  constructor(
    public doc: PDFDocument,
    public regular: PDFFont,
    public bold: PDFFont,
    public italic: PDFFont,
    public logo: PDFImage | null,
    public data: ProposalPdfData
  ) {}

  newPage(first = false) {
    if (this.dry) return; // measuring: keep going on the same (imaginary) page
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

  // How tall a block of drawing code is, measured without drawing it.
  heightOf(fn: () => void): number {
    const savedPage = this.page;
    const savedY = this.y;
    this.dry = true;
    this.page = NOOP_PAGE;
    try {
      fn();
      return savedY - this.y;
    } finally {
      this.dry = false;
      this.page = savedPage;
      this.y = savedY;
    }
  }

  // Draws a section so that it stays on one page: if it doesn't fit in what is left of this
  // page but would fit on a fresh one, it starts on a new page. (A section longer than a page
  // just flows; its heading still stays with the first lines.)
  keep(fn: () => void) {
    const h = this.heightOf(fn);
    if (this.y - h < BOTTOM && h <= H - 66 - BOTTOM) this.newPage();
    fn();
  }

  // A cover letter (any language, any line-break style): it can start right under the overview and
  // flow over the page break, but the last paragraph and the sign-off after it (the short closing
  // lines: "Best regards, / Name / Company") always stay together on one page.
  letter(text: string, size = 10) {
    const lines = text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").split("\n").map((l) => l.replace(/\s+$/, ""));
    while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
    // The sign-off: trailing short lines (at most 5 non-blank), blank lines in between allowed.
    let sig = lines.length;
    let filled = 0;
    while (sig > 0) {
      const l = lines[sig - 1];
      if (!l.trim()) sig--;
      else if (l.trim().length < 60 && filled < 5) {
        filled++;
        sig--;
      } else break;
    }
    if (sig === 0) sig = lines.length; // nothing but short lines: treat it all as body
    const signoff = lines.slice(sig);
    // Body paragraphs: separated by blank lines; with no blank lines at all, one paragraph per line.
    const bodyText = lines.slice(0, sig).join("\n").trim();
    const blocks = bodyText ? bodyText.split(/\n[ \t]*\n+/).map((x) => x.trim()).filter(Boolean) : [];
    const paras = blocks.length === 1 && blocks[0].includes("\n") ? blocks[0].split("\n").map((x) => x.trim()).filter(Boolean) : blocks;
    const last = paras.length > 1 ? paras.length - 1 : 0;
    paras.slice(0, last).forEach((x) => {
      this.paragraph(x, { size });
      this.gap(6);
    });
    this.keep(() => {
      paras.slice(last).forEach((x) => {
        this.paragraph(x, { size });
        this.gap(6);
      });
      signoff.forEach((l) => {
        if (l.trim()) this.paragraph(l.trim(), { size });
        else this.gap(6);
      });
      this.gap(6);
    });
  }

  ensure(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  gap(n: number) {
    this.y -= n;
  }

  heading(title: string) {
    this.ensure(84); // keep the heading with the first lines under it
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
    const lines = this.wrap(t, CONTENT_W - indent, size, font);
    // Widows and orphans: never leave a single line of a paragraph alone at the bottom of a page
    // or at the top of the next one (a short paragraph that can't be split moves whole).
    let breakAt = -1;
    if (!this.dry) {
      const fit = Math.max(0, Math.floor((this.y - BOTTOM) / leading));
      if (lines.length > fit) {
        if (lines.length < 4) breakAt = 0;
        else if (fit < 2) breakAt = 0;
        else if (lines.length - fit < 2) breakAt = lines.length - 2;
      }
    }
    lines.forEach((line, i) => {
      if (i === breakAt) this.newPage();
      this.ensure(leading);
      this.text(line, MX + indent, this.y, { size, font, color: o.color });
      this.gap(leading);
    });
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
    opts: { boldLast?: boolean; details?: (string | null | undefined)[] } = {}
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
    this.ensure(60); // the header row and the first row stay together
    drawHeader();
    rows.forEach((row, ri) => {
      const wrapped = row.map((cell, i) => this.wrap(cell, cols[i].width - 12, 9.5, this.regular));
      const lines = Math.max(...wrapped.map((w) => w.length));
      const detailLines = opts.details?.[ri] ? this.wrap(opts.details[ri] as string, cols[0].width - 16, 8.5, this.regular) : [];
      const h = lines * 12 + (detailLines.length ? detailLines.length * 11 + 3 : 0) + 8;
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
      detailLines.forEach((dl, di) => {
        this.text(dl, colX[0] + 4, this.y - lines * 12 - 1 - di * 11, { size: 8.5, color: SOFT });
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
  // Full horizontal logo (wordmark + tagline) on the dark band; contact line under it.
  if (logo) {
    const w = 270;
    const h = (w / logo.width) * logo.height;
    lo.page.drawImage(logo, { x: MX - 6, y: H - 30 - h, width: w, height: h });
    lo.text([data.company.website, data.company.email].filter(Boolean).join("  ·  "), MX, H - 30 - h - 14, { size: 9, color: MIST, maxWidth: 270 });
  } else {
    lo.text(data.company.name, MX, H - 52, { size: 17, font: bold, color: MIST, maxWidth: 250 });
    lo.text(data.company.website, MX, H - 82, { size: 9, color: MIST, maxWidth: 250 });
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
  const y1 = block(t.preparedFor, [data.client.name, data.client.company ?? "", data.client.email ?? "", data.client.phone ?? "", ...(data.client.address ?? "").split("\n")], MX);
  const y2 = block(t.preparedBy, [data.company.name, data.company.website, data.company.email ?? ""], MX + colW + 16);
  lo.y = Math.min(y1, y2) - 6;

  // ---- overview
  lo.keep(() => {
  lo.heading(t.overview);
  const typeList = data.project.typeLabels && data.project.typeLabels.length > 0 ? data.project.typeLabels : [data.project.typeLabel];
  const facts: [string, string[]][] = [
    [t.project, [data.project.name]],
    // Every type of work in the project, one per line ("Types" when there are several).
    [typeList.length > 1 ? t.types : t.type, typeList],
    ...(data.project.startDate ? ([[t.start, [fmtDate(data.project.startDate, data.lang)]]] as [string, string[]][]) : []),
    ...(data.project.dueDate ? ([[t.due, [fmtDate(data.project.dueDate, data.lang)]]] as [string, string[]][]) : []),
  ];
  for (const [k, values] of facts) {
    lo.ensure(14 * values.length);
    lo.text(k, MX, lo.y, { size: 9.5, font: bold, color: SOFT });
    for (const v of values) {
      lo.text(v, MX + 120, lo.y, { size: 9.5, maxWidth: CONTENT_W - 120 });
      lo.gap(14);
    }
  }
  });
  if (data.coverLetter) {
    lo.gap(4);
    lo.letter(data.coverLetter, 10);
  }
  if (data.project.description) {
    lo.gap(4);
    lo.paragraph(data.project.description, { size: 10 });
  }

  if (data.details.length > 0) {
    if (doc.getPageCount() === 1) lo.newPage(); // project details start on page 2
    // Each type's details stay together (the heading goes with the first group).
    const groups: { group?: string; rows: typeof data.details }[] = [];
    for (const d of data.details) {
      const last = groups[groups.length - 1];
      if (last && last.group === d.group) last.rows.push(d);
      else groups.push({ group: d.group, rows: [d] });
    }
    groups.forEach((g, gi) =>
      lo.keep(() => {
        if (gi === 0) lo.heading(t.details);
        if (g.group) {
          lo.gap(4);
          lo.text(g.group, MX, lo.y, { size: 10.5, font: bold, color: GREEN });
          lo.gap(16);
        }
        for (const d of g.rows) {
          const lines = lo.wrap(d.value, CONTENT_W - 150, 9.5, regular);
          lo.ensure(lines.length * 13 + 2);
          lo.text(d.label, MX, lo.y, { size: 9.5, font: bold, color: SOFT, maxWidth: 140 });
          lines.forEach((ln, i) => lo.text(ln, MX + 150, lo.y - i * 13, { size: 9.5 }));
          lo.gap(lines.length * 13 + 2);
        }
      })
    );
  }

  // ---- plan
  if (data.plan.length > 0) {
    data.plan.forEach((ph, i) =>
      lo.keep(() => {
        if (i === 0) {
          lo.heading(t.plan);
          lo.paragraph(t.planIntro, { size: 9.5, color: SOFT, font: italic });
          lo.gap(4);
        }
        lo.ensure(40);
        lo.page.drawRectangle({ x: MX, y: lo.y - 5, width: 22, height: 18, color: LIME });
        lo.text(String(i + 1), MX + (i + 1 > 9 ? 5 : 8), lo.y, { size: 10, font: bold, color: GREEN });
        lo.text(ph.name, MX + 32, lo.y, { size: 11.5, font: bold, color: GREEN, maxWidth: CONTENT_W - 40 });
        lo.gap(18);
        ph.tasks.forEach((tk) => lo.bullet(tk, 32));
        lo.gap(6);
      })
    );
  }

  // ---- investment (heading, items, totals and tax note stay together when they fit on a page)
  lo.keep(() => {
  lo.heading(t.investment);
  const rows: string[][] = data.lineItems.map((li) => [li.description, String(li.quantity), money(li.unitPrice, data.currency), money(li.quantity * li.unitPrice, data.currency)]);
  lo.table(
    [
      { header: t.description, width: CONTENT_W - 8 - 40 - 100 - 100 },
      { header: t.qty, width: 40, align: "right" },
      { header: t.unit, width: 100, align: "right" },
      { header: t.amount, width: 100, align: "right" },
    ],
    rows,
    { details: data.lineItems.map((li) => li.details) }
  );
  // totals block (right aligned)
  const totalsRows: [string, number, boolean][] = [[t.subtotal, data.totals.subtotal, false]];
  if (data.totals.gst) totalsRows.push([t.gst, data.totals.gst, false]);
  if (data.totals.qst) totalsRows.push([t.qst, data.totals.qst, false]);
  if (data.totals.hst) totalsRows.push([t.hst, data.totals.hst, false]);
  const grand = data.totals.subtotal + data.totals.total;
  totalsRows.push([t.total, grand, true]);
  lo.ensure(totalsRows.length * 16 + 36); // keep the totals block together
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
  });

  const subs = data.subscriptions ?? [];
  const costs = data.supplierCosts ?? [];
  // third-party apps & subscriptions (paid to the providers, not in the total)
  if (subs.length > 0) {
    lo.keep(() => {
    lo.gap(6);
    lo.ensure(60);
    lo.text(t.subsTitle, MX, lo.y, { size: 11.5, font: bold, color: GREEN });
    lo.gap(14);
    lo.paragraph(t.subsNote, { size: 8.5, color: SOFT, font: italic });
    lo.gap(8);
    const periodLabel = (p: string) => (p === "year" ? t.perYear : p === "once" ? t.oneTime : t.perMonth);
    lo.table(
      [
        { header: t.service, width: 180 },
        { header: t.billing, width: 80 },
        { header: t.amount, width: 100, align: "right" },
        { header: t.note, width: CONTENT_W - 8 - 180 - 80 - 100 },
      ],
      subs.map((x) => [x.name, periodLabel(x.period), x.amount > 0 ? money(x.amount, data.currency) : "—", x.note])
    );
    const monthly = subs.filter((x) => x.period === "month").reduce((a, x) => a + x.amount, 0);
    const yearly = subs.filter((x) => x.period === "year").reduce((a, x) => a + x.amount, 0);
    const once = subs.filter((x) => x.period === "once").reduce((a, x) => a + x.amount, 0);
    const est = [monthly ? `${money(monthly, data.currency)} ${t.perMonth}` : "", yearly ? `${money(yearly, data.currency)} ${t.perYear}` : "", once ? `${money(once, data.currency)} ${t.oneTime}` : ""].filter(Boolean).join("  ·  ");
    if (est) lo.paragraph(`${t.subsEstimate}: ${est}`, { size: 9, font: bold });
    });
  }

  // supplier costs already paid on the client's behalf (billed at cost; invoices attached)
  if (costs.length > 0) {
    lo.keep(() => {
    lo.gap(6);
    lo.ensure(60);
    lo.text(t.supplierTitle, MX, lo.y, { size: 11.5, font: bold, color: GREEN });
    lo.gap(14);
    lo.paragraph(t.supplierNote, { size: 8.5, color: SOFT, font: italic });
    lo.gap(8);
    lo.table(
      [
        { header: t.service, width: CONTENT_W - 8 - 100 },
        { header: t.amount, width: 100, align: "right" },
      ],
      costs.map((c) => [`${c.supplier}${c.reference ? ` #${c.reference}` : ""}`, money(c.total, c.currency)]),
      { details: costs.map((c) => c.description) }
    );
    });
  }

  // ---- schedule
  if (data.instalments.length > 0) {
    lo.keep(() => {
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
    });
  }

  // ---- payment method
  lo.keep(() => {
    lo.heading(t.payment);
    lo.paragraph(t.paymentBody, { size: 10 });
  });

  if (data.notes) {
    lo.keep(() => {
      lo.heading(t.notes);
      lo.paragraph(data.notes as string);
    });
  }

  // ---- terms
  lo.keep(() => {
    lo.heading(t.terms);
    for (const term of [t.terms1, t.terms2, t.terms3, t.terms4, t.terms5]) lo.bullet(term, 4);
  });

  // ---- acceptance
  lo.keep(() => {
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
  });

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

  await appendAttachments(doc, { regular, bold }, t.attachments, data.attachments ?? []);
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
  // For an instalment invoice: where it sits in the contract and what was already billed.
  instalment?: {
    n: number;
    of: number;
    final: boolean;
    contractTotal: number; // the accepted proposal, taxes included
    previous: { number: string; date: Date; subtotal: number; tax: number; total: number; paid: boolean }[];
    thisTotal: number;
    balance: number; // left to invoice after this invoice
  } | null;
  // The client's country decides the wording and the legal notices: Canada, US, UK, France.
  jurisdiction?: "CA" | "US" | "GB" | "FR" | "OTHER";
  lineItems: { description: string; details?: string | null; quantity: number; unitPrice: number }[];
  attachments?: PdfAttachment[];
  totals: { subtotal: number; gst: number; qst: number; hst: number; total: number };
  notes?: string | null;
}

const LI = {
  en: { invoice: "INVOICE", billTo: "Billed to", from: "From", issued: "Issued", due: "Due", paid: "PAID", project: "Project", payment: "How to pay",
    paymentBody: "Please pay by the due date using the method agreed in your proposal (for example Interac e-Transfer or credit card). Payment details will be confirmed with this invoice; reply to this email if you need them again.",
    thanks: "Thank you for your business.", amountDue: "Amount due", subtotal: "Subtotal", description: "Description", qty: "Qty", unit: "Unit price", amount: "Amount", notes: "Notes", gst: "GST", qst: "QST", hst: "HST", attachments: "Attachments", page: (n: number, t: number) => `Page ${n} of ${t}`,
    instalmentInvoice: "INSTALMENT INVOICE", finalInvoice: "FINAL INVOICE", summary: "Payment schedule", contract: "Contract total (taxes included)", previously: "Already invoiced", thisInvoice: "This invoice", balanceAfter: "Balance left to invoice after this invoice", balanceDue: "Balance due on this invoice", beforeTax: "before tax", taxes: "taxes", paidWord: "paid", unpaidWord: "unpaid", instalmentWord: "Instalment",
    frNotice: "Late-payment penalties: three times the legal interest rate, and a fixed recovery fee of EUR 40 (French Commercial Code, art. L441-10). No early-payment discount." },
  fr: { invoice: "FACTURE", billTo: "Facturé à", from: "De", issued: "Émise le", due: "Échéance", paid: "PAYÉE", project: "Projet", payment: "Comment payer",
    paymentBody: "Veuillez payer d'ici l'échéance selon le mode convenu dans votre soumission (par exemple virement Interac ou carte de crédit). Les détails de paiement seront confirmés avec cette facture; répondez à ce courriel si vous en avez besoin à nouveau.",
    thanks: "Merci de votre confiance.", amountDue: "Montant dû", subtotal: "Sous-total", description: "Description", qty: "Qté", unit: "Prix unitaire", amount: "Montant", notes: "Notes", gst: "TPS", qst: "TVQ", hst: "TVH", attachments: "Pièces jointes", page: (n: number, t: number) => `Page ${n} de ${t}`,
    instalmentInvoice: "FACTURE DE VERSEMENT", finalInvoice: "FACTURE FINALE", summary: "Calendrier de paiement", contract: "Total du contrat (taxes incluses)", previously: "Déjà facturé", thisInvoice: "Cette facture", balanceAfter: "Solde restant à facturer après cette facture", balanceDue: "Solde dû sur cette facture", beforeTax: "avant taxes", taxes: "taxes", paidWord: "payée", unpaidWord: "impayée", instalmentWord: "Versement",
    frNotice: "Pénalités de retard : trois fois le taux d'intérêt légal, et indemnité forfaitaire de 40 EUR pour frais de recouvrement (Code de commerce, art. L441-10). Pas d'escompte pour paiement anticipé." },
};

// France: an instalment before the last is a "facture d'acompte", the last a "facture de solde".
function invoiceTitle(data: InvoicePdfData, t: (typeof LI)["en"]): string {
  if (!data.instalment || data.instalment.of < 2) return t.invoice;
  if (data.lang === "fr" && data.jurisdiction === "FR") return data.instalment.final ? "FACTURE DE SOLDE" : "FACTURE D'ACOMPTE";
  return data.instalment.final ? t.finalInvoice : t.instalmentInvoice;
}

export async function buildInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const t = LI[data.lang];
  const title = invoiceTitle(data, t);
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} ${data.number}`);
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
  const asProposal = { title: `${title} ${data.number}`, number: data.number } as ProposalPdfData;
  const lo = new Layout(doc, regular, bold, italic, logo, asProposal);
  lo.newPage(true);

  lo.page.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: GREEN });
  lo.page.drawRectangle({ x: 0, y: H - 154, width: W, height: 4, color: GOLD });
  if (logo) {
    const w = 250;
    const h = (w / logo.width) * logo.height;
    lo.page.drawImage(logo, { x: MX - 6, y: H - 28 - h, width: w, height: h });
    lo.text([data.company.website, data.company.email].filter(Boolean).join("  ·  "), MX, H - 28 - h - 13, { size: 9, color: MIST, maxWidth: 250 });
  } else {
    lo.text(data.company.name, MX, H - 52, { size: 16, font: bold, color: MIST, maxWidth: 250 });
    lo.text(data.company.website, MX, H - 68, { size: 9, color: MIST, maxWidth: 250 });
  }
  const titleSize = bold.widthOfTextAtSize(title, 28) > 330 ? 18 : 28;
  lo.text(title, W - MX - bold.widthOfTextAtSize(title, titleSize), H - 66, { size: titleSize, font: bold, color: MIST });
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
  const y1 = block(t.billTo, [data.client.name, data.client.company ?? "", data.client.email ?? "", ...(data.client.address ?? "").split("\n")], MX);
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
  const ins = data.instalment;
  if (ins && ins.of > 1) {
    // Where this invoice sits in the contract: what was billed before, this one, and what is left.
    lo.keep(() => {
      const rowsOut: [string, string, boolean][] = [[t.contract, money(ins.contractTotal, data.currency), false]];
      ins.previous.forEach((p, i) => {
        const tax = p.tax > 0 ? ` (${money(p.subtotal, data.currency)} ${t.beforeTax} + ${money(p.tax, data.currency)} ${t.taxes})` : "";
        rowsOut.push([`${t.instalmentWord} ${i + 1}/${ins.of} — #${p.number}, ${fmtDate(p.date, data.lang)}, ${p.paid ? t.paidWord : t.unpaidWord}${tax}`, money(p.total, data.currency), false]);
      });
      rowsOut.push([`${t.thisInvoice} — ${t.instalmentWord} ${ins.n}/${ins.of}`, money(ins.thisTotal, data.currency), true]);
      rowsOut.push([ins.final ? t.balanceDue : t.balanceAfter, money(Math.max(0, ins.balance), data.currency), false]);
      lo.heading(t.summary);
      for (const [label, value, strong] of rowsOut) {
        const f = strong ? bold : regular;
        const lines = lo.wrap(label, CONTENT_W - 120, 9.5, f);
        lines.forEach((ln, i) => {
          lo.ensure(14);
          lo.text(ln, MX, lo.y, { size: 9.5, font: f, color: strong ? GREEN : INK });
          if (i === 0) lo.text(value, W - MX - f.widthOfTextAtSize(safe(value), 9.5), lo.y, { size: 9.5, font: f, color: strong ? GREEN : INK });
          lo.gap(13);
        });
      }
      lo.gap(16);
    });
  }
  lo.table(
    [
      { header: t.description, width: CONTENT_W - 8 - 40 - 100 - 100 },
      { header: t.qty, width: 40, align: "right" },
      { header: t.unit, width: 100, align: "right" },
      { header: t.amount, width: 100, align: "right" },
    ],
    data.lineItems.map((li) => [li.description, String(li.quantity), money(li.unitPrice, data.currency), money(li.quantity * li.unitPrice, data.currency)]),
    { details: data.lineItems.map((li) => li.details) }
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
  if (data.jurisdiction === "FR") lo.paragraph(t.frNotice, { size: 8.5, color: SOFT });
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
  await appendAttachments(doc, { regular, bold }, t.attachments, data.attachments ?? []);
  return doc.save();
}
