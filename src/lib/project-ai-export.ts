import type { PrismaClient } from "@/lib/prisma";
import { displayValue, defaultTemplate, typesOfProject, valuesOfType } from "@/lib/project-templates";
import { getProjectTemplate } from "@/lib/project-template-store";
import { publicBaseUrl } from "@/lib/twilio";
import { buildContactMarkdownFiles } from "@/lib/contact-ai-export";
import type { CalendarEventSummary } from "@/lib/google";
import { signPath } from "@/lib/signed-url";

// The "Export for AI" pack for one project: everything on the Project page,
// plus every file of the client's Contact pack (prefixed "contact-").

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const clean = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function kv(rows: [string, unknown][]): string {
  const lines = rows.filter(([, v]) => clean(v) !== "").map(([k, v]) => `- **${k}:** ${clean(v).replace(/\n/g, "\n  ")}`);
  return lines.length ? lines.join("\n") + "\n" : "_Nothing recorded._\n";
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body.trimEnd()}\n\n`;
}

const money = (n: number, cur: string) => `${n.toFixed(2)} ${cur}`;

export async function buildProjectMarkdownFiles(
  db: PrismaClient,
  projectId: string,
  options: { isAdmin?: boolean; includeSharedApiKeys?: boolean; origin?: string; calendarEvents?: CalendarEventSummary[] } = {}
): Promise<{ projectName: string; files: { name: string; content: string }[]; binaryFiles: { name: string; data: Uint8Array }[] } | null> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, company: true, email: true } },
      owner: { select: { name: true } },
      supervisor: { select: { name: true } },
      teamMembers: { include: { user: { select: { name: true } } } },
      phases: {
        orderBy: { order: "asc" },
        include: { supervisor: { select: { name: true } }, tasks: { orderBy: { createdAt: "asc" }, include: { assignee: { select: { name: true } }, supervisor: { select: { name: true } } } } },
      },
      tasks: { where: { phaseId: null }, orderBy: { createdAt: "asc" }, include: { assignee: { select: { name: true } } } },
      proposals: { orderBy: { createdAt: "desc" }, include: { lineItems: { orderBy: { order: "asc" } }, paymentSchedule: { orderBy: { order: "asc" } } } },
      invoices: { orderBy: { createdAt: "desc" }, include: { lineItems: { orderBy: { order: "asc" } } } },
      supplierInvoices: { orderBy: { createdAt: "asc" }, include: { billedInvoice: { select: { number: true } } } },
      interactions: { orderBy: { occurredAt: "desc" }, include: { participants: { include: { contact: { select: { firstName: true, lastName: true } }, user: { select: { name: true } } } } } },
      emailLinks: { orderBy: { messageDate: "desc" } },
      calendarEventLinks: true,
      activity: { orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true } } } },
    },
  });
  if (!p) return null;

  const contactPack = await buildContactMarkdownFiles(db, p.contactId, {
    isAdmin: options.isAdmin,
    includeSharedApiKeys: options.includeSharedApiKeys,
    origin: options.origin,
  });
  const contactName = contactPack?.contactName ?? "Client";
  const base = publicBaseUrl(options.origin);
  const types = typesOfProject(p);
  const typeBlocks = await Promise.all(
    types.map(async (type) => ({ type, template: await getProjectTemplate(db, type).catch(() => defaultTemplate(type)), answers: valuesOfType(p, type) }))
  );
  const phaseName = (id: string | null) => p.phases.find((ph) => ph.id === id)?.name;
  const pending = Array.isArray(p.pendingPhases) ? (p.pendingPhases as { name?: string; tasks?: string[]; stage?: string }[]) : [];

  // ---- 01 project
  let proj = `# ${p.name} — Project\n\n`;
  proj += section(
    "General",
    kv([
      ["Project", p.name],
      ["Client", `${contactName}${p.contact.email ? ` <${p.contact.email}>` : ""}`],
      ["Types (in order)", types.join(", ")],
      ["Status", `${p.status}${p.lifecycleManaged ? " (managed by the project lifecycle)" : ""}`],
      ["Owner", p.owner?.name],
      ["Supervisor", p.supervisor?.name],
      ["Team", p.teamMembers.map((t) => t.user.name).join(", ")],
      ["Start", day(p.startDate)],
      ["Due", day(p.dueDate)],
      ["Created", day(p.createdAt)],
      ["CRM page", base ? `${base}/projects/${p.id}` : ""],
      ["Description", p.description],
    ])
  );
  for (const { type, template, answers } of typeBlocks) {
    proj += section(`${type} details (custom fields)`, kv(template.fields.filter((f) => f.type !== "spacer").map((f) => [f.label, displayValue(answers[f.key])] as [string, unknown])));
  }
  proj += section("Notes", clean(p.notes) || "_No notes._");

  proj += "## Phases & tasks (existing — do not duplicate)\n\n";
  if (p.phases.length === 0) proj += "_No phases yet._\n\n";
  for (const ph of p.phases) {
    proj += `### ${ph.name} — ${ph.status}\n\n`;
    proj += kv([
      ["Type", ph.phaseType],
      ["Supervisor", ph.supervisor?.name],
      ["Start", day(ph.startDate)],
      ["Due", day(ph.dueDate)],
      ["Description", ph.description],
      ["Notes", ph.notes],
    ]);
    proj += "\n";
    for (const tk of ph.tasks) {
      proj += `- [${tk.status === "DONE" ? "x" : " "}] **${tk.title}** _(${tk.status.toLowerCase().replace("_", " ")}, ${tk.priority.toLowerCase()} priority)_`;
      proj += [tk.assignee && ` — ${tk.assignee.name}`, tk.startDate && ` · start ${day(tk.startDate)}`, tk.dueDate && ` · due ${day(tk.dueDate)}`, tk.completedAt && ` · completed ${day(tk.completedAt)}`].filter(Boolean).join("");
      if (tk.description) proj += `\n  - ${clean(tk.description).replace(/\n/g, " ")}`;
      proj += "\n";
    }
    proj += "\n";
  }
  if (p.tasks.length > 0) {
    proj += "### Tasks without a phase\n\n";
    for (const tk of p.tasks) proj += `- [${tk.status === "DONE" ? "x" : " "}] **${tk.title}** _(${tk.status.toLowerCase().replace("_", " ")})_${tk.assignee ? ` — ${tk.assignee.name}` : ""}\n`;
    proj += "\n";
  }
  if (pending.length > 0) {
    proj += section(
      "Phases still to come (created automatically, one at a time)",
      pending.map((x) => `- **${x.name}** (${x.stage ?? "ACTIVE"}) — planned tasks: ${(x.tasks ?? []).join("; ") || "none"}`).join("\n")
    );
  }
  proj += section(
    "Activity log (most recent 100)",
    p.activity.length ? p.activity.map((a) => `- ${a.createdAt.toISOString().slice(0, 16).replace("T", " ")}${a.user ? ` · ${a.user.name}` : ""} — ${clean(a.message)}`).join("\n") : "_None._"
  );

  // ---- 02 proposals, instalments & invoices
  let fin = `# ${p.name} — Proposals, instalments & invoices\n\n`;
  if (p.proposals.length === 0) fin += "_No proposals yet._\n\n";
  for (const pr of p.proposals) {
    fin += `## Proposal: ${pr.title} — ${pr.status}\n\n`;
    fin += kv([
      ["Sent", day(pr.sentAt)],
      ["Answered", day(pr.respondedAt)],
      ["Subtotal", money(pr.subtotal, pr.currency)],
      ["GST", pr.gstAmount ? money(pr.gstAmount, pr.currency) : ""],
      ["QST", pr.qstAmount ? money(pr.qstAmount, pr.currency) : ""],
      ["HST", pr.hstAmount ? money(pr.hstAmount, pr.currency) : ""],
      ["Total", money(pr.totalAmount, pr.currency)],
      ["Notes", pr.notes],
      ["Cover letter", pr.coverLetter],
    ]);
    if (pr.lineItems.length > 0) fin += "\n**Line items**\n\n" + pr.lineItems.map((li) => `- ${li.description} — ${li.quantity} × ${money(li.unitPrice, pr.currency)}${li.details ? `\n  - ${clean(li.details).replace(/\n/g, " ")}` : ""}`).join("\n") + "\n";
    if (pr.paymentSchedule.length > 0) {
      fin +=
        "\n**Payment schedule (instalments)**\n\n" +
        pr.paymentSchedule
          .map((r, i) => {
            const amount = r.amount ?? (r.percentage != null ? (r.percentage / 100) * pr.totalAmount : null);
            return `${i + 1}. ${r.label}${r.percentage != null ? ` — ${r.percentage}%` : ""}${amount != null ? ` (${money(amount, pr.currency)})` : ""}${r.dueDate ? `, due ${day(r.dueDate)}` : ""} — ${r.paid ? `PAID${r.paidAt ? ` ${day(r.paidAt)}` : ""}` : "not paid"}`;
          })
          .join("\n") +
        "\n";
    }
    const subs = (Array.isArray(pr.subscriptions) ? pr.subscriptions : []) as { name: string; amount: number; period: string; note: string }[];
    if (subs.length > 0) {
      fin +=
        "\n**Apps & subscriptions (paid by the client directly to the providers, not in the total)**\n\n" +
        subs.map((x) => `- ${x.name} — ${x.amount > 0 ? money(x.amount, pr.currency) : "amount to confirm"} ${x.period === "year" ? "per year" : x.period === "once" ? "one-time" : "per month"}${x.note ? ` (${x.note})` : ""}`).join("\n") +
        "\n";
    }
    fin += "\n";
  }
  if (p.invoices.length === 0) fin += "## Invoices\n\n_No invoices yet._\n";
  for (const inv of p.invoices) {
    fin += `## Invoice ${clean(inv.number) || "(no number)"} — ${inv.status}\n\n`;
    fin += kv([
      ["Subtotal", money(inv.subtotal, inv.currency)],
      ["Taxes", inv.taxAmount ? money(inv.taxAmount, inv.currency) : ""],
      ["Total", money(inv.totalAmount, inv.currency)],
      ["Due", day(inv.dueDate)],
      ["Sent", day(inv.sentAt)],
      ["Paid", day(inv.paidAt)],
      ["Reminders sent", inv.reminderCount || ""],
      ["Notes", inv.notes],
    ]);
    if (inv.lineItems.length > 0) fin += "\n" + inv.lineItems.map((li) => `- ${li.description} — ${li.quantity} × ${money(li.unitPrice, inv.currency)}${li.details ? `\n  - ${clean(li.details).replace(/\n/g, " ")}` : ""}`).join("\n") + "\n";
    fin += "\n";
  }


  // Supplier invoices paid on the client's behalf (files go in the zip, and are linked).
  const binaryFiles: { name: string; data: Uint8Array }[] = [...(contactPack?.binaryFiles ?? [])];
  fin += "## Supplier invoices paid on the client's behalf\n\n";
  if (p.supplierInvoices.length === 0) fin += "_None._\n\n";
  for (const c of p.supplierInvoices) {
    let fileLine = "";
    if (c.fileData && c.fileName) {
      const path = `/api/projects/${p.id}/supplier-invoices/${c.id}/file`;
      const ext = (c.fileName.split(".").pop() ?? "bin").toLowerCase();
      const zipName = `supplier-invoices/${(c.supplier + (c.reference ? `-${c.reference}` : "")).replace(/[^\w.-]+/g, "-")}.${ext}`;
      binaryFiles.push({ name: zipName, data: c.fileData as unknown as Uint8Array });
      let link = "";
      if (base) {
        const { exp, sig } = await signPath(path, 7 * 86400);
        link = ` · download: ${base}${path}?exp=${exp}&sig=${sig} (valid 7 days)`;
      }
      fileLine = `in the .zip at \`${zipName}\`${link}`;
    }
    fin += `- **${c.supplier}${c.reference ? ` #${c.reference}` : ""}** — ${money(c.totalAmount, c.currency)} (before tax ${money(c.subtotal, c.currency)}; GST ${c.gstAmount.toFixed(2)}, QST ${c.qstAmount.toFixed(2)}, HST ${c.hstAmount.toFixed(2)})\n`;
    fin += `  - paid ${day(c.paidDate) || "(date not set)"}${c.paymentMethod ? ` by ${c.paymentMethod}` : ""} · ${c.reimbursable ? `re-billable to the client — ${c.reimbursementStatus}${c.billedInvoice ? ` (on invoice ${clean(c.billedInvoice.number) || "—"})` : ""}` : "our cost (not re-billed)"}${c.description ? ` · ${clean(c.description)}` : ""}${fileLine ? ` · file: ${fileLine}` : ""}\n`;
  }
  fin += "\n";

  // ---- 03 communications & calendar
  let comms = `# ${p.name} — Calls, texts, emails & calendar\n\n`;
  comms += section(
    "Calls, texts, meetings & notes linked to this project",
    p.interactions.length
      ? p.interactions
          .map((i) => {
            const who = i.participants.map((x) => (x.contact ? [x.contact.firstName, x.contact.lastName].filter(Boolean).join(" ") : x.user?.name)).filter(Boolean).join(", ");
            return `- **${day(i.occurredAt)} · ${i.type}${i.direction ? ` (${i.direction.toLowerCase()})` : ""}${i.subject ? ` · ${i.subject}` : ""}${phaseName(i.phaseId) ? ` · phase ${phaseName(i.phaseId)}` : ""}${who ? ` · ${who}` : ""}:** ${clean(i.notes).replace(/\n/g, " ")}`;
          })
          .join("\n")
      : "_None._"
  );
  comms += section(
    "Linked emails (subjects)",
    p.emailLinks.length ? p.emailLinks.map((e) => `- ${day(e.messageDate)} · ${clean(e.subject) || "(no subject)"}${e.fromLabel ? ` — ${e.fromLabel}` : ""}${phaseName(e.phaseId) ? ` · phase ${phaseName(e.phaseId)}` : ""}`).join("\n") : "_None linked._"
  );
  const events = options.calendarEvents ?? [];
  comms += section(
    "Linked calendar events",
    events.length
      ? events
          .map((ev) => {
            const link = p.calendarEventLinks.find((l) => l.googleEventId === ev.id);
            return `- ${ev.start ? ev.start.slice(0, 16).replace("T", " ") : ""} · ${ev.title}${phaseName(link?.phaseId ?? null) ? ` · phase ${phaseName(link?.phaseId ?? null)}` : ""}`;
          })
          .join("\n")
      : p.calendarEventLinks.length
        ? `_${p.calendarEventLinks.length} event(s) linked (details unavailable without a Google connection)._`
        : "_None linked._"
  );

  const readme = `# ${p.name} — AI briefing pack (project + client)

Generated ${new Date().toISOString().slice(0, 10)} from the AMO CRM.

## Instructions for the AI

- **Do not duplicate work.** Before proposing or creating any phase or task, read \`01-project.md\`: every existing phase and task (open and done) is listed there, plus the phases that are still to come. If something equivalent exists, refer to it instead of adding it again.
- The project moves through statuses: Proposal → Planning → Active → Final → Completed, gated by the proposal answer and the instalments (see \`02-project-proposals-and-invoices.md\`). Work on later phases only when the project has reached them.
- Everything about the client is in the \`contact-*\` files (profile, brand, tech stack, domains, history). Use the brand and AI-context files for tone and preferences.
- Uploaded brand files are in the zip under \`brand-files/\` and as download links (which expire).
- If something you need isn't in these files, ask rather than guess.

## Files

| File | What it holds |
|---|---|
| 01-project.md | Everything on the Project page: details, custom answers, notes, phases, tasks, upcoming phases, activity |
| 02-project-proposals-and-invoices.md | Proposals (line items with details, taxes, subscriptions, instalments paid / unpaid), invoices and the supplier invoices paid on the client's behalf |
| 03-project-communications.md | Calls, texts, emails and calendar events linked to the project |
| contact-00-README.md … contact-07-*.md | The client's full Contact pack (profile, AI context & notes, brand, tech & domains, all projects, communications, purchases/sync/activity) |

User IDs and passwords are never exported. API keys only if flagged for sharing and requested at export time.
`;

  const contactFiles = (contactPack?.files ?? []).map((f) => ({ name: `contact-${f.name}`, content: f.content }));
  return {
    projectName: p.name,
    binaryFiles,
    files: [
      { name: "00-README.md", content: readme },
      { name: "01-project.md", content: proj },
      { name: "02-project-proposals-and-invoices.md", content: fin },
      { name: "03-project-communications.md", content: comms },
      ...contactFiles,
    ],
  };
}
