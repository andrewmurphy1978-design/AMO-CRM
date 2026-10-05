import type { PrismaClient } from "@/lib/prisma";
import { BRAND_CATEGORIES, isDataUri } from "@/lib/brand";
import { decryptSecret } from "@/lib/crypto";
import { signPath } from "@/lib/signed-url";
import { publicBaseUrl } from "@/lib/twilio";
import { CREDENTIAL_LOGIN_METHODS } from "@/lib/contact-form-fields";
import { displayValue, defaultTemplate, typesOfProject, valuesOfType } from "@/lib/project-templates";
import { getProjectTemplate } from "@/lib/project-template-store";

// Builds the Markdown files describing one contact, to hand to an AI
// assistant. Login credentials are never included.

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const clean = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function kv(rows: [string, unknown][]): string {
  const lines = rows.filter(([, v]) => clean(v) !== "").map(([k, v]) => `- **${k}:** ${clean(v).replace(/\n/g, "\n  ")}`);
  return lines.length ? lines.join("\n") + "\n" : "_Nothing recorded._\n";
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body.trimEnd()}\n\n`;
}

function address(parts: unknown[]): string {
  return parts.map(clean).filter(Boolean).join(", ");
}

export async function buildContactMarkdownFiles(db: PrismaClient, contactId: string, options: { isAdmin?: boolean; includeSharedApiKeys?: boolean; origin?: string } = {}): Promise<{ contactName: string; files: { name: string; content: string }[]; binaryFiles: { name: string; data: Uint8Array }[] } | null> {
  const c = await db.contact.findUnique({
    where: { id: contactId },
    include: {
      owner: { select: { name: true } },
      tags: { include: { tag: true } },
      fieldValues: { include: { definition: true } },
      socialLinks: true,
      extraAddresses: { orderBy: { order: "asc" } },
      messagingAccounts: { orderBy: { order: "asc" } },
      voipAccounts: { orderBy: { order: "asc" } },
      techStackItems: { orderBy: { order: "asc" } },
      domains: { orderBy: { order: "asc" } },
      credentials: { orderBy: { createdAt: "asc" }, select: { label: true, url: true, loginMethod: true, apiKeyEncrypted: true, apiKeyLast4: true, shareApiKeyWithAi: true } },
      brandItems: { orderBy: [{ category: "asc" }, { order: "asc" }] },
      contactNotes: { orderBy: { createdAt: "desc" } },
      relationsFrom: { include: { relatedContact: { select: { firstName: true, lastName: true, company: true, email: true } } } },
      projects: {
        orderBy: { createdAt: "desc" },
        include: {
          proposals: { orderBy: { createdAt: "desc" }, select: { title: true, status: true, totalAmount: true, currency: true, sentAt: true, respondedAt: true } },
          invoices: { orderBy: { createdAt: "desc" }, select: { number: true, status: true, totalAmount: true, currency: true, dueDate: true, paidAt: true } },
          owner: { select: { name: true } },
          supervisor: { select: { name: true } },
          phases: { orderBy: { order: "asc" }, include: { tasks: { orderBy: { createdAt: "asc" }, include: { assignee: { select: { name: true } } } } } },
          tasks: { where: { phaseId: null }, include: { assignee: { select: { name: true } } } },
        },
      },
      subscriptions: { orderBy: { startedAt: "desc" } },
      courseEnrollments: { orderBy: { enrolledAt: "desc" } },
      communityMemberships: { orderBy: { joinedAt: "desc" } },
      bookings: { orderBy: { scheduledFor: "desc" } },
      appSyncSettings: true,
      activity: { orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true } } } },
      interactions: { orderBy: { occurredAt: "desc" }, take: 60 },
      emailLinks: { orderBy: { messageDate: "desc" }, take: 40 },
    },
  });
  if (!c) return null;

  const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || "Contact";
  const nameOf = (x: { firstName: string | null; lastName: string | null; company: string | null; email: string | null }) =>
    [x.firstName, x.lastName].filter(Boolean).join(" ") || x.company || x.email || "—";

  // ---- 01 profile
  let profile = `# ${fullName} — Profile\n\n`;
  profile += section(
    "General",
    kv([
      ["Name", fullName],
      ["Nickname", c.nickname],
      ["Company", c.company],
      ["Job title", c.jobTitle],
      ["Company type", c.companyType],
      ["Industry", c.industry],
      ["Website", c.website],
      ["Stage", c.stage],
      ["Birthday", c.birthday],
      ["Language / locale", c.locale],
      ["Time zone", c.timeZone],
      ["Jurisdiction", address([c.jurisdictionRegion, c.jurisdictionCountry])],
      ["Account owner", c.owner?.name],
      ["Source", c.source],
      ["Tags", c.tags.map((t) => t.tag.name).join(", ")],
      ["Added", day(c.createdAt)],
    ])
  );
  profile += section(
    "Contact info",
    kv([
      ["Emails", [c.email, c.email2, ...c.extraEmails].filter(Boolean).join(", ")],
      ["Phones", [c.phone, c.phone2, ...c.extraPhones].filter(Boolean).join(", ")],
      ["Messaging apps", c.messagingAccounts.map((m) => `${m.app}: ${m.handle}`).join("; ")],
      ["VoIP apps", c.voipAccounts.map((m) => `${m.app}: ${m.handle}`).join("; ")],
      ["Social media", c.socialLinks.map((s) => `${s.platform}: ${s.url}`).join("; ")],
    ])
  );
  profile += section("Main address", kv([["Address", address([c.address, c.city, c.state, c.zip, c.country])]]));
  if (c.extraAddresses.length > 0) {
    profile += section("Other addresses", c.extraAddresses.map((a) => `- **${clean(a.description) || "Address"}:** ${address([a.address, a.city, a.state, a.zip, a.country])}`).join("\n"));
  }
  profile += section(
    "Billing",
    kv([
      ["Billing contact", c.billingContactName],
      ["Billing email", c.billingEmail],
      ["Billing phone", c.billingPhone],
      ["Billing address", address([c.billingAddress, c.billingCity, c.billingState, c.billingZip, c.billingCountry])],
      ["Preferred currency", c.preferredCurrency],
      ["Payment terms", c.paymentTerms],
      ["Payment schedule", c.paymentSchedule],
      ["Default discount", c.defaultDiscount != null ? `${c.defaultDiscount}%` : ""],
      ["Automatic invoice reminders", c.autoSendInvoiceReminders ? "Yes" : ""],
    ])
  );
  if (c.relationsFrom.length > 0) {
    profile += section("Related contacts", c.relationsFrom.map((r) => `- ${nameOf(r.relatedContact)} — ${r.relationType}${r.notes ? ` (${r.notes})` : ""}`).join("\n"));
  }
  const customFields = c.fieldValues.filter((f) => clean(f.value));
  if (customFields.length > 0) {
    profile += section("Other fields", kv(customFields.map((f) => [f.definition?.label ?? f.fieldSlug, f.value] as [string, unknown])));
  }

  // ---- 02 AI context
  let context = `# ${fullName} — Context for AI\n\n`;
  context += section("Written for AI", clean(c.aiDetails) || "_Nothing written yet (the “Contact details for AI” card is empty)._");
  if (clean(c.notes)) context += section("General note", clean(c.notes));
  context += section(
    "Notes",
    c.contactNotes.length > 0 ? c.contactNotes.map((n) => `### ${day(n.createdAt)}\n\n${clean(n.text)}`).join("\n\n") : "_No notes._"
  );

  // ---- 03 brand
  // Uploaded files get a signed link (valid 7 days, no login) so an AI given
  // this export can download them by itself.
  const FILE_LINK_DAYS = 7;
  const base = publicBaseUrl(options.origin);
  const fileLinks = new Map<string, string>();
  const binaryFiles: { name: string; data: Uint8Array }[] = [];
  const usedNames = new Set<string>();
  for (const b of c.brandItems) {
    if (!isDataUri(b.value)) continue;
    const parts: string[] = [];
    // The same file inside the .zip, as a relative path.
    const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([\s\S]*)$/i.exec((b.value ?? "").trim());
    if (match) {
      const ext = (match[1].split("/")[1] ?? "bin").replace("svg+xml", "svg").replace("jpeg", "jpg");
      let name = `brand-files/${b.category}/${(b.label || "file").replace(/[^\w.-]+/g, "-")}.${ext}`;
      for (let n = 2; usedNames.has(name); n++) name = name.replace(/(-\d+)?\.(\w+)$/, `-${n}.$2`);
      usedNames.add(name);
      binaryFiles.push({ name, data: Uint8Array.from(atob(match[2]), (ch) => ch.charCodeAt(0)) });
      parts.push(`in the .zip at \`${name}\``);
    }
    if (base) {
      const path = `/api/brand-files/${b.id}`;
      const { exp, sig } = await signPath(path, FILE_LINK_DAYS * 86400);
      parts.push(`download: ${base}${path}?exp=${exp}&sig=${sig}`);
    }
    fileLinks.set(b.id, parts.join(" · "));
  }
  let brand = `# ${fullName} — Brand\n\n`;
  if (c.brandItems.length === 0) brand += "_No brand assets recorded yet._\n";
  for (const cat of BRAND_CATEGORIES) {
    const items = c.brandItems.filter((b) => b.category === cat.key);
    if (items.length === 0) continue;
    const lines = items.map((b) => {
      const value = clean(b.value);
      const shown = isDataUri(value) ? (fileLinks.get(b.id) ?? "(file uploaded in the CRM)") : value;
      return `- **${b.label}**${shown ? `: ${shown}` : ""}${b.note ? ` — ${b.note}` : ""}`;
    });
    brand += section(cat.en, lines.join("\n"));
  }

  // ---- 04 tech + domains
  let tech = `# ${fullName} — Tech stack & domains\n\n`;
  const stack: [string, string | null, string | null, string | null][] = [
    ["Website", c.websiteDomain, c.websiteHostingProvider, c.websiteDesignApp],
    ["Funnels", c.funnelsDomain, c.funnelsHostingProvider, c.funnelsDesignApp],
    ["Email", c.emailDomain, c.emailHostingProvider, c.emailMarketingApp],
    ["Store", c.storeDomain, c.storeHostingProvider, c.storeDesignApp],
    ...c.techStackItems.map((i) => [i.label, i.domain, i.hostingProvider, i.app] as [string, string | null, string | null, string | null]),
  ];
  const stackLines = stack
    .filter(([, d, h, a]) => d || h || a)
    .map(([label, d, h, a]) => `- **${label}:** ${[d && `domain ${d}`, h && `hosting ${h}`, a && `app ${a}`].filter(Boolean).join(" · ")}`);
  tech += section("Tech stack", stackLines.length ? stackLines.join("\n") : "_Nothing recorded._");
  tech += section(
    "Domains",
    c.domains.length
      ? c.domains
          .map(
            (d) =>
              `- **${d.domain}** — ${[d.registrar && `registrar ${d.registrar}`, d.dnsProvider && `DNS ${d.dnsProvider}`, d.expiryDate && `expires ${day(d.expiryDate)}`, d.autoRenew && "auto-renew", d.managedBy && `managed by ${d.managedBy}`]
                .filter(Boolean)
                .join(" · ")}${d.notes ? `\n  - ${clean(d.notes)}` : ""}`
          )
          .join("\n")
      : "_No domains recorded._"
  );

  // The apps/sites the contact has accounts with — names, addresses and how
  // they sign in only. User IDs, passwords and notes are never exported.
  // API keys: never exported unless an admin asks for shared keys AND this
  // entry is flagged "Share with AI". Otherwise only a hint is shown.
  const appLines: string[] = [];
  for (const a of c.credentials) {
    const method = a.loginMethod && a.loginMethod !== "password" ? CREDENTIAL_LOGIN_METHODS.find((m) => m.value === a.loginMethod)?.label ?? a.loginMethod : null;
    let key = "";
    if (a.apiKeyEncrypted) {
      if (options.isAdmin && options.includeSharedApiKeys && a.shareApiKeyWithAi) {
        try {
          key = ` · API key: \`${await decryptSecret(a.apiKeyEncrypted)}\``;
        } catch {
          key = " · API key on file (could not be decrypted)";
        }
      } else if (options.isAdmin && a.apiKeyLast4) {
        key = ` · API key on file (ends …${a.apiKeyLast4}, not shared)`;
      } else {
        key = " · API key on file (not shared)";
      }
    }
    appLines.push(`- **${a.label}**${a.url ? ` — ${a.url}` : ""}${method ? ` (signs in with ${method})` : ""}${key}`);
  }
  tech += section("Apps & accounts used (no user IDs or passwords)", appLines.length ? appLines.join("\n") : "_None recorded._");

  // ---- 05 projects
  let projects = `# ${fullName} — Projects\n\n`;
  if (c.projects.length === 0) projects += "_No projects yet._\n";
  for (const p of c.projects) {
    const ptypes = typesOfProject(p);
    const typeBlocks = await Promise.all(
      ptypes.map(async (type) => ({ type, template: await getProjectTemplate(db, type).catch(() => defaultTemplate(type)), answers: valuesOfType(p, type) }))
    );
    projects += `## ${p.name}\n\n${base ? `CRM page: ${base}/projects/${p.id}\n\n` : ""}`;
    projects += kv([
      ["Types (in order)", ptypes.join(", ")],
      ["Status", p.status],
      ["Owner", p.owner?.name],
      ["Supervisor", p.supervisor?.name],
      ["Start", day(p.startDate)],
      ["Due", day(p.dueDate)],
      ["Description", p.description],
      ["Notes", p.notes],
      ...typeBlocks.flatMap(({ type, template, answers }) =>
        template.fields.filter((f) => f.type !== "spacer").map((f) => [ptypes.length > 1 ? `${type}: ${f.label}` : f.label, displayValue(answers[f.key])] as [string, unknown])
      ),
    ]);
    if (p.phases.length > 0) {
      projects += "\n**Phases & tasks**\n\n";
      for (const ph of p.phases) {
        projects += `- **${ph.name}** (${ph.status})${ph.notes ? ` — ${clean(ph.notes)}` : ""}\n`;
        for (const tk of ph.tasks)
          projects += `  - [${tk.status === "DONE" ? "x" : " "}] ${tk.title} _(${tk.status.toLowerCase().replace("_", " ")})_${tk.assignee ? ` — ${tk.assignee.name}` : ""}${tk.dueDate ? ` (due ${day(tk.dueDate)})` : ""}${tk.description ? `\n    - ${clean(tk.description).replace(/\n/g, " ")}` : ""}\n`;
      }
    }
    if (p.tasks.length > 0) {
      projects += "\n**Tasks without a phase**\n\n";
      for (const tk of p.tasks) projects += `- [${tk.status === "DONE" ? "x" : " "}] ${tk.title}${tk.assignee ? ` — ${tk.assignee.name}` : ""}\n`;
    }
    projects += "\n";
  }

  // ---- 06 communications
  let comms = `# ${fullName} — Calls, texts & emails\n\n`;
  comms += section(
    "Calls, texts, meetings & notes (most recent 60)",
    c.interactions.length
      ? c.interactions
          .map((i) => `- **${day(i.occurredAt)} · ${i.type}${i.direction ? ` (${i.direction.toLowerCase()})` : ""}${i.subject ? ` · ${i.subject}` : ""}:** ${clean(i.notes).replace(/\n/g, " ")}`)
          .join("\n")
      : "_None recorded._"
  );
  comms += section(
    "Linked emails (subjects, most recent 40)",
    c.emailLinks.length ? c.emailLinks.map((e) => `- ${day(e.messageDate)} · ${clean(e.subject) || "(no subject)"}${e.fromLabel ? ` — ${e.fromLabel}` : ""}`).join("\n") : "_None linked._"
  );

  // ---- 07 purchases, sync, billing documents and activity
  let extra = `# ${fullName} — Purchases, sync & activity\n\n`;
  extra += section(
    "Subscriptions (systeme.io)",
    c.subscriptions.length ? c.subscriptions.map((x) => `- **${clean(x.planName) || "Subscription"}** — ${[x.status, x.amount != null ? `${x.amount} ${clean(x.currency)}` : "", x.startedAt && `started ${day(x.startedAt)}`, x.canceledAt && `canceled ${day(x.canceledAt)}`].filter(Boolean).join(" · ")}`).join("\n") : "_None._"
  );
  extra += section(
    "Course enrollments",
    c.courseEnrollments.length ? c.courseEnrollments.map((x) => `- **${clean(x.courseName) || "Course"}** — ${[x.status, x.enrolledAt && `enrolled ${day(x.enrolledAt)}`].filter(Boolean).join(" · ")}`).join("\n") : "_None._"
  );
  extra += section(
    "Community memberships",
    c.communityMemberships.length ? c.communityMemberships.map((x) => `- **${clean(x.communityName) || "Community"}** — ${[x.status, x.joinedAt && `joined ${day(x.joinedAt)}`].filter(Boolean).join(" · ")}`).join("\n") : "_None._"
  );
  extra += section(
    "Bookings",
    c.bookings.length ? c.bookings.map((x) => `- **${clean(x.eventName) || "Booking"}** — ${[x.status, x.paymentStatus && `payment ${x.paymentStatus}`, x.scheduledFor && `scheduled ${day(x.scheduledFor)}`].filter(Boolean).join(" · ")}`).join("\n") : "_None._"
  );
  extra += section(
    "Proposals & invoices on this contact's projects",
    c.projects.length
      ? c.projects
          .map((p) => {
            const lines = [
              ...p.proposals.map((x) => `  - Proposal “${x.title}” — ${x.status}, ${x.totalAmount.toFixed(2)} ${x.currency}${x.sentAt ? `, sent ${day(x.sentAt)}` : ""}${x.respondedAt ? `, answered ${day(x.respondedAt)}` : ""}`),
              ...p.invoices.map((x) => `  - Invoice ${clean(x.number) || "(no number)"} — ${x.status}, ${x.totalAmount.toFixed(2)} ${x.currency}${x.dueDate ? `, due ${day(x.dueDate)}` : ""}${x.paidAt ? `, paid ${day(x.paidAt)}` : ""}`),
            ];
            return `- **${p.name}**${lines.length ? "\n" + lines.join("\n") : " — none"}`;
          })
          .join("\n")
      : "_No projects._"
  );
  extra += section(
    "Sync with other apps",
    kv([
      ["systeme.io contact id", c.systemeIoId],
      ["systeme.io registered", day(c.systemeIoRegisteredAt)],
      ["Google Contacts id", c.googleContactId],
      ["Last synced", day(c.lastSyncedAt)],
      ...c.appSyncSettings.map((a) => [`${a.app} sync`, `${a.enabled ? "on" : "off"}, direction ${a.direction}${a.lastSyncedAt ? `, last ${day(a.lastSyncedAt)}` : ""}${a.lastSyncStatus ? ` (${a.lastSyncStatus})` : ""}`] as [string, unknown]),
    ])
  );
  extra += section(
    "System activity (most recent 100)",
    c.activity.length ? c.activity.map((a) => `- ${a.createdAt.toISOString().slice(0, 16).replace("T", " ")}${a.user ? ` · ${a.user.name}` : ""} — ${clean(a.message)}`).join("\n") : "_None._"
  );

  const readme = `# ${fullName} — AI briefing pack

Generated ${new Date().toISOString().slice(0, 10)} from the AMO CRM. Give an AI assistant these files so it understands who this contact is and what we're doing for them.

## Instructions for the AI

- **Do not duplicate work.** Before proposing or creating any project, phase or task, read \`05-projects.md\`: every existing project, phase and task (open and done) is listed there. If something equivalent already exists, refer to it instead of adding it again. Only propose what is genuinely missing.
- Use \`03-brand.md\` (colours, fonts, voice, logos) and \`02-ai-context.md\` for tone and preferences, and \`04-tech-stack-and-domains.md\` for the tools already in use.
- Files uploaded to the brand card appear as download links in \`03-brand.md\` — fetch them yourself when you need them (the links expire).
- If something you need isn't in these files, ask rather than guess.

| File | What it holds |
|---|---|
| 01-profile.md | Identity, company, contact info, addresses, billing, relations |
| 02-ai-context.md | Background written for AI, plus notes |
| 03-brand.md | Logos, colours, fonts, voice, photos, components, icons, graphics, charts |
| 04-tech-stack-and-domains.md | Websites, hosting, apps, domains, and the apps/accounts used (no logins) |
| 05-projects.md | Projects with custom answers, phases and tasks |
| 06-communications.md | Recent calls, texts, meetings and linked email subjects |\n| 07-purchases-sync-and-activity.md | Subscriptions, courses, bookings, proposals/invoices, sync status, system activity |

User IDs and passwords are never exported (the apps themselves are listed in 04). API keys appear only if they were explicitly flagged for sharing and requested at export time. Uploaded brand files are included in the .zip under brand-files/ (the path is shown next to each item in 03-brand.md) and also given as download links (valid for 7 days, no login needed — anyone holding a link can fetch that file, so only share this pack with an AI you trust). Links to files hosted elsewhere are included as they are.
`;

  return {
    contactName: fullName,
    binaryFiles,
    files: [
      { name: "00-README.md", content: readme },
      { name: "01-profile.md", content: profile },
      { name: "02-ai-context.md", content: context },
      { name: "03-brand.md", content: brand },
      { name: "04-tech-stack-and-domains.md", content: tech },
      { name: "05-projects.md", content: projects },
      { name: "06-communications.md", content: comms },
      { name: "07-purchases-sync-and-activity.md", content: extra },
    ],
  };
}
