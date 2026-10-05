// Project-type templates: for each type of project, the custom fields asked
// for when a project is created, and the phases/tasks generated from the
// answers. Pure data + functions (no server imports) so the same code runs
// in the New Project form, the server action and the customization page.
//
// A template is plain JSON, stored per type in ProjectTypeTemplate; types
// with no saved row fall back to DEFAULT_TEMPLATES below.

// "spacer" is a blank cell ("Free space"): it asks nothing and just pushes the next
// field along in the 3-column layout, e.g. to start a new line.
export type FieldType = "yesno" | "text" | "textarea" | "url" | "select" | "multiselect" | "languages" | "spacer";

export interface Cond {
  field: string;
  op: "yes" | "no" | "notEmpty" | "equals" | "includes";
  value?: string;
}

export interface FieldTpl {
  key: string;
  label: string;
  type: FieldType;
  // select / multiselect choices ("languages" uses LANGUAGE_OPTIONS).
  options?: string[];
  // Lets the user type extra choices beyond `options` ("others").
  allowOther?: boolean;
  // Only asked (and used) while this condition holds.
  showIf?: Cond;
  // Names an app / service the client pays for: its answer is added to the
  // project's Apps & subscriptions (default: the built-in app-like fields).
  app?: boolean;
  // While the field is hidden, leave its cell empty instead of letting the
  // next fields move up.
  keepSpace?: boolean;
}

export interface TaskTpl {
  title: string;
  when?: Cond;
  // Field keys (multiselect/languages) to repeat the task for — one task per
  // combination; {key} in the title is replaced by the current value.
  repeat?: string[];
}

// Which project status a phase belongs to: PROPOSAL (proposal until the 1st
// instalment), PLANNING (research / mock-up), ACTIVE (building ... deploying),
// FINAL (last instalment). Moving between stages is gated by approvals and
// payments (see lib/project-progress.ts).
export type PhaseStage = "PROPOSAL" | "PLANNING" | "ACTIVE" | "FINAL";
export const PHASE_STAGES: PhaseStage[] = ["PROPOSAL", "PLANNING", "ACTIVE", "FINAL"];

export interface PhaseTpl {
  name: string;
  when?: Cond;
  stage?: PhaseStage;
  tasks: TaskTpl[];
}

export interface TemplateConfig {
  fields: FieldTpl[];
  phases: PhaseTpl[];
  // Default (undefined / true): a new project only gets its first phase and
  // that phase's tasks; each next phase is added when the previous one is
  // completed. Set to false to create every phase up front.
  progressive?: boolean;
}

export type FieldValues = Record<string, string | string[]>;

// The order project types are offered in (New Project form, edit dialogs and
// the customization page).
export const PROJECT_TYPE_ORDER = [
  "WEBSITE",
  "FUNNEL",
  "BLOG",
  "NEWSLETTER",
  "APP",
  "STORE",
  "CRM_CUSTOMIZATION",
  "SOCIAL_MEDIA",
  "POST_AUTOMATION",
  "AUTOMATION",
  "EMAIL_MARKETING",
  "SMS_MARKETING",
  "TRAINING",
  "AFFILIATE_MARKETING",
] as const;

// Older types kept so existing projects still show them; no longer offered
// for new projects (they only appear in a dropdown when already selected).
export const LEGACY_PROJECT_TYPES = ["CONSULTING", "OTHER"] as const;

export const TEMPLATE_TYPES = PROJECT_TYPE_ORDER;

// `keys`: the full ordered list (built-in + custom, as saved); defaults to the built-in order.
export function projectTypeOptions(labels: Record<string, string>, current?: string | null, keys?: string[]): { value: string; label: string }[] {
  const list: string[] = keys && keys.length > 0 ? [...keys] : [...PROJECT_TYPE_ORDER];
  if (current && (LEGACY_PROJECT_TYPES as readonly string[]).includes(current)) list.push(current);
  return list.map((value) => ({ value, label: labels[value] ?? value }));
}

export const LANGUAGE_OPTIONS = ["English", "French", "Spanish", "German", "Italian", "Portuguese", "Dutch", "Arabic", "Mandarin"];

export function optionsFor(field: FieldTpl): string[] {
  return field.type === "languages" ? (field.options?.length ? field.options : LANGUAGE_OPTIONS) : (field.options ?? []);
}

export function isMulti(field: FieldTpl): boolean {
  return field.type === "multiselect" || field.type === "languages";
}

function isEmpty(v: string | string[] | undefined): boolean {
  return v === undefined || (Array.isArray(v) ? v.length === 0 : v.trim() === "");
}

export function evalCond(cond: Cond | undefined, values: FieldValues): boolean {
  if (!cond || !cond.field) return true;
  const v = values[cond.field];
  switch (cond.op) {
    case "yes":
      return v === "Y";
    case "no":
      return v === "N";
    case "notEmpty":
      return !isEmpty(v);
    case "equals":
      return !Array.isArray(v) && v === cond.value;
    case "includes":
      return Array.isArray(v) ? v.includes(cond.value ?? "") : v === cond.value;
  }
  return true;
}

// The keys of the fields that are shown. A hidden field's old answer must not
// keep other fields alive (Model = No hides "Model approval", whose stale Yes
// would otherwise still show "Model approval by"), so conditions are
// evaluated against the answers of visible fields only, until nothing changes.
export function visibleFieldKeys(fields: FieldTpl[], values: FieldValues): Set<string> {
  let visible = new Set(fields.map((f) => f.key));
  for (let round = 0; round <= fields.length; round++) {
    const effective: FieldValues = {};
    for (const [k, v] of Object.entries(values)) if (visible.has(k)) effective[k] = v;
    const next = new Set(fields.filter((f) => evalCond(f.showIf, effective)).map((f) => f.key));
    if (next.size === visible.size && [...next].every((k) => visible.has(k))) return next;
    visible = next;
  }
  return visible;
}

// Pass `fields` (the whole template) so hidden fields' answers are ignored.
export function isFieldVisible(field: FieldTpl, values: FieldValues, fields?: FieldTpl[]): boolean {
  return fields ? visibleFieldKeys(fields, values).has(field.key) : evalCond(field.showIf, values);
}

// Drops answers to fields that are hidden (their showIf no longer holds) or
// that no longer exist in the template.
export function cleanValues(config: TemplateConfig, values: FieldValues): FieldValues {
  const out: FieldValues = {};
  const visible = visibleFieldKeys(config.fields, values);
  for (const field of config.fields) {
    if (!visible.has(field.key)) continue;
    const v = values[field.key];
    if (v !== undefined && !isEmpty(v)) out[field.key] = v;
  }
  return out;
}

// Reads `cf_<key>` entries from a submitted form.
export function readFieldValues(config: TemplateConfig, get: (name: string) => string[]): FieldValues {
  const values: FieldValues = {};
  for (const field of config.fields) {
    const raw = get(`cf_${field.key}`).map((v) => v.trim()).filter(Boolean);
    if (raw.length === 0) continue;
    values[field.key] = isMulti(field) ? [...new Set(raw)] : raw[0];
  }
  return cleanValues(config, values);
}

function display(v: string | string[] | undefined): string {
  if (v === undefined) return "";
  if (Array.isArray(v)) return v.join(", ");
  return v === "Y" ? "Yes" : v === "N" ? "No" : v;
}

export function displayValue(v: string | string[] | undefined): string {
  return display(v);
}

function tidy(title: string): string {
  return title
    .replace(/\([^()]*:\s*\)/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s–-]+$/g, "")
    .trim();
}

function expandTitle(task: TaskTpl, values: FieldValues): string[] {
  const keys = task.repeat ?? [];
  let combos: Record<string, string>[] = [{}];
  for (const key of keys) {
    const v = values[key];
    const items = Array.isArray(v) ? v : v ? [v] : [""];
    combos = combos.flatMap((c) => items.map((item) => ({ ...c, [key]: item })));
  }
  return combos.map((combo) =>
    tidy(task.title.replace(/\{(\w+)\}/g, (_, key: string) => (key in combo ? combo[key] : display(values[key]))))
  );
}

// Every project type starts with this phase: the proposal is prepared, sent,
// answered, and the 1st instalment received. Only then does the project move
// on to Planning.
export function planningPhase(): PhaseTpl {
  return {
    name: "Proposal",
    stage: "PROPOSAL",
    tasks: [
      { title: "Prepare the proposal" },
      { title: "Present (send) the proposal" },
      { title: "Await the answer to the proposal" },
      { title: "Receive the signed proposal and 1st instalment" },
    ],
  };
}

export interface ProjectPlan {
  phases: { name: string; tasks: string[]; stage: PhaseStage }[];
}

// Turns a template + the answers into the phases/tasks to create. Phases with a
// false condition are skipped.
export function buildPlan(config: TemplateConfig, rawValues: FieldValues): ProjectPlan {
  const values = cleanValues(config, rawValues);
  const phases: ProjectPlan["phases"] = [];
  for (const phase of config.phases) {
    if (!evalCond(phase.when, values)) continue;
    const titles: string[] = [];
    for (const task of phase.tasks) {
      if (!evalCond(task.when, values)) continue;
      for (const title of expandTitle(task, values)) if (title && !titles.includes(title)) titles.push(title);
    }
    phases.push({ name: tidy(phase.name), tasks: titles, stage: phase.stage ?? "ACTIVE" });
  }
  return { phases };
}

// Defensive parse of a stored/submitted config.
export function sanitizeConfig(input: unknown): TemplateConfig {
  const obj = (input && typeof input === "object" ? input : {}) as Partial<TemplateConfig>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const cond = (c: unknown): Cond | undefined => {
    if (!c || typeof c !== "object") return undefined;
    const x = c as Partial<Cond>;
    if (!x.field || !x.op || !["yes", "no", "notEmpty", "equals", "includes"].includes(x.op)) return undefined;
    return { field: str(x.field), op: x.op, ...(x.value ? { value: str(x.value) } : {}) };
  };
  const seen = new Set<string>();
  const fields: FieldTpl[] = [];
  for (const f of Array.isArray(obj.fields) ? obj.fields : []) {
    const isSpacer = f?.type === "spacer";
    const label = isSpacer ? "Free space" : str(f?.label).trim();
    if (!label) continue;
    let key = str(f?.key).trim() || (isSpacer ? "space" : "") || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
    while (seen.has(key)) key += "_2";
    seen.add(key);
    const type = (["yesno", "text", "textarea", "url", "select", "multiselect", "languages", "spacer"] as const).includes(f?.type as FieldType) ? (f.type as FieldType) : "text";
    fields.push({
      key,
      label,
      type,
      ...(Array.isArray(f?.options) ? { options: f.options.map(str).map((o: string) => o.trim()).filter(Boolean) } : {}),
      ...(f?.allowOther ? { allowOther: true } : {}),
      ...(cond(f?.showIf) ? { showIf: cond(f?.showIf) } : {}),
      ...(f?.keepSpace && cond(f?.showIf) ? { keepSpace: true } : {}),
      ...(typeof f?.app === "boolean" ? { app: f.app } : {}),
    });
  }
  const phases: PhaseTpl[] = [];
  for (const p of Array.isArray(obj.phases) ? obj.phases : []) {
    const name = str(p?.name).trim();
    if (!name) continue;
    const tasks: TaskTpl[] = [];
    for (const tk of Array.isArray(p?.tasks) ? p.tasks : []) {
      const title = str(tk?.title).trim();
      if (!title) continue;
      tasks.push({
        title,
        ...(cond(tk?.when) ? { when: cond(tk?.when) } : {}),
        ...(Array.isArray(tk?.repeat) && tk.repeat.length ? { repeat: tk.repeat.map(str).filter(Boolean) } : {}),
      });
    }
    phases.push({
      name,
      ...(cond(p?.when) ? { when: cond(p?.when) } : {}),
      ...(PHASE_STAGES.includes(p?.stage as PhaseStage) ? { stage: p.stage as PhaseStage } : {}),
      tasks,
    });
  }
  return { fields, phases, ...(obj.progressive === false ? { progressive: false } : {}) };
}

// ---------------------------------------------------------------- defaults

const yes = (field: string): Cond => ({ field, op: "yes" });
const filled = (field: string): Cond => ({ field, op: "notEmpty" });

const APPS = ["Systeme.io", "ClickFunnels", "GoHighLevel", "GoDaddy", "WordPress"];

function sharedBuildFields(domainLabel: string): FieldTpl[] {
  return [
    { key: "domainSetup", label: domainLabel, type: "yesno" },
    { key: "registrar", label: "Registrar", type: "text", showIf: yes("domainSetup") },
    { key: "dnsProvider", label: "DNS Provider", type: "text", showIf: yes("domainSetup") },
    { key: "appSetup", label: "App setup", type: "yesno" },
    { key: "app", label: "App to use", type: "select", options: APPS, showIf: yes("appSetup") },
    { key: "research", label: "Research competition", type: "yesno" },
    { key: "model", label: "Mock-up", type: "yesno" },
    { key: "modelApproval", label: "Mock-up approval", type: "yesno", showIf: yes("model") },
    { key: "modelApprovalBy", label: "Mock-up approval by", type: "text", showIf: yes("modelApproval") },
    { key: "languages", label: "Languages", type: "languages", allowOther: true },
  ];
}

function sharedPrepPhases(domainTask: string): PhaseTpl[] {
  return [
    {
      name: "Research",
      when: yes("research"),
      tasks: [{ title: "Find competitors" }, { title: "Take screenshots" }, { title: "Produce report" }],
    },
    {
      name: "Mock-up",
      when: yes("model"),
      tasks: [
        { title: "Build mock-up" },
        { title: "Present mock-up", when: yes("modelApproval") },
        { title: "Get mock-up approval ({modelApprovalBy})", when: yes("modelApproval") },
      ],
    },
    {
      name: "Domain Setup",
      when: yes("domainSetup"),
      tasks: [{ title: domainTask }, { title: "Setup domain (DNS: {dnsProvider})" }],
    },
    {
      name: "App Setup",
      when: yes("appSetup"),
      tasks: [
        { title: "Create {app} account" },
        { title: "Migrate domain", when: yes("domainSetup") },
        { title: "Setup app ({app})" },
      ],
    },
  ];
}

export const DEFAULT_TEMPLATES: Record<string, TemplateConfig> = {
  WEBSITE: {
    fields: [
      ...sharedBuildFields("Domain setup"),
      {
        key: "pages",
        label: "Pages",
        type: "multiselect",
        options: ["Home Page", "Services Page", "Product Page", "About Page", "Contact Page", "Team Page"],
        allowOther: true,
      },
      { key: "forms", label: "Forms", type: "multiselect", options: ["Opt-In Forms", "Meeting Form", "Contact Form"], allowOther: true },
    ],
    phases: [
      ...sharedPrepPhases("Buy domain"),
      {
        name: "Building Pages",
        tasks: [
          { title: "Build {languages} {pages}", repeat: ["languages", "pages"] },
          { title: "Build {languages} {forms}", repeat: ["languages", "forms"], when: filled("forms") },
        ],
      },
      {
        name: "Testing",
        tasks: [
          { title: "Test {languages} {pages}", repeat: ["languages", "pages"] },
          { title: "Test {languages} {forms}", repeat: ["languages", "forms"], when: filled("forms") },
        ],
      },
    ],
  },
  FUNNEL: {
    fields: [
      ...sharedBuildFields("Domain / sub-domain setup"),
      {
        key: "funnels",
        label: "Funnels",
        type: "multiselect",
        options: ["Lead Funnel", "Call/Meeting Funnel", "Sales Funnel", "Webinar Funnel", "Bridge Funnel"],
        allowOther: true,
      },
      { key: "leadMagnetDescription", label: "Lead magnet description", type: "textarea" },
      { key: "leadMagnetFile", label: "Lead magnet file (link)", type: "url" },
    ],
    phases: [
      ...sharedPrepPhases("Buy domain / sub-domain"),
      {
        name: "Lead Magnet",
        when: filled("leadMagnetDescription"),
        tasks: [{ title: "Create lead magnet" }, { title: "Upload lead magnet file", when: filled("leadMagnetFile") }, { title: "Connect lead magnet delivery" }],
      },
      {
        name: "Building Funnels",
        tasks: [{ title: "Build {funnels} ({languages})", repeat: ["languages", "funnels"] }],
      },
      {
        name: "Testing",
        tasks: [{ title: "Test {funnels} ({languages})", repeat: ["languages", "funnels"] }],
      },
    ],
  },
  SOCIAL_MEDIA: {
    fields: [
      {
        key: "platforms",
        label: "Social media platforms",
        type: "multiselect",
        options: ["Facebook", "Instagram", "LinkedIn", "TikTok", "X", "YouTube"],
        allowOther: true,
      },
      { key: "languages", label: "Languages", type: "languages", allowOther: true },
      {
        key: "setup",
        label: "What to set up",
        type: "multiselect",
        options: [
          "Facebook Profile",
          "Facebook Pages",
          "Instagram Profiles",
          "LinkedIn Profile",
          "LinkedIn Pages",
          "TikTok Profiles",
          "X Profiles",
          "YouTube Account",
          "YouTube Channels",
        ],
        allowOther: true,
      },
    ],
    phases: [
      { name: "Account Setup", when: filled("setup"), tasks: [{ title: "Set up {setup}", repeat: ["setup"] }] },
      {
        name: "Profile Optimization",
        when: filled("platforms"),
        tasks: [{ title: "Optimize {platforms} profile ({languages})", repeat: ["platforms", "languages"] }],
      },
      { name: "Review", tasks: [{ title: "Review all accounts with the client" }] },
    ],
  },
  BLOG: {
    fields: [
      { key: "app", label: "Blog platform", type: "select", options: ["WordPress", "Systeme.io", "GoHighLevel", "ClickFunnels", "Wix", "Squarespace"], allowOther: true },
      { key: "languages", label: "Languages", type: "languages", allowOther: true },
      { key: "topics", label: "Topics / categories", type: "multiselect", options: [], allowOther: true },
      { key: "articles", label: "Number of articles to write", type: "text" },
      { key: "research", label: "Keyword & competition research", type: "yesno" },
      { key: "seo", label: "SEO optimization", type: "yesno" },
      { key: "optIn", label: "Newsletter opt-in form on the blog", type: "yesno" },
    ],
    phases: [
      { name: "Research", when: yes("research"), tasks: [{ title: "Research keywords" }, { title: "Review competitor blogs" }, { title: "Produce content plan" }] },
      {
        name: "Blog Setup",
        tasks: [
          { title: "Create the blog ({app})" },
          { title: "Configure design and menus" },
          { title: "Create categories: {topics}", when: filled("topics") },
          { title: "Add newsletter opt-in form", when: yes("optIn") },
        ],
      },
      {
        name: "Writing",
        tasks: [{ title: "Write {languages} article – {topics}", repeat: ["languages", "topics"] }],
      },
      { name: "SEO", when: yes("seo"), tasks: [{ title: "Optimize titles and meta descriptions" }, { title: "Add internal links and images" }] },
      { name: "Publishing", tasks: [{ title: "Review articles with the client" }, { title: "Publish articles" }, { title: "Test blog on mobile" }] },
    ],
  },
  NEWSLETTER: {
    fields: [
      { key: "esp", label: "Email platform", type: "select", options: ["GetResponse", "Systeme.io", "Mailchimp", "ClickFunnels", "GoHighLevel", "Brevo", "Kit"], allowOther: true },
      { key: "languages", label: "Languages", type: "languages", allowOther: true },
      { key: "frequency", label: "Frequency", type: "select", options: ["Weekly", "Bi-weekly", "Monthly"], allowOther: true },
      { key: "listImport", label: "Import an existing list", type: "yesno" },
      { key: "welcome", label: "Welcome email sequence", type: "yesno" },
    ],
    phases: [
      {
        name: "Setup",
        tasks: [
          { title: "Create {esp} account" },
          { title: "Authenticate sender domain" },
          { title: "Import and clean the existing list", when: yes("listImport") },
          { title: "Create sign-up form" },
        ],
      },
      { name: "Template", tasks: [{ title: "Design newsletter template" }, { title: "Get template approval" }] },
      { name: "Welcome Sequence", when: yes("welcome"), tasks: [{ title: "Write {languages} welcome email", repeat: ["languages"] }, { title: "Build welcome automation" }] },
      { name: "Content", tasks: [{ title: "Write first {languages} newsletter ({frequency})", repeat: ["languages"] }] },
      { name: "Testing & Launch", tasks: [{ title: "Send test emails" }, { title: "Check deliverability and spam score" }, { title: "Send first newsletter" }] },
    ],
  },
  POST_AUTOMATION: {
    fields: [
      { key: "platforms", label: "Platforms", type: "multiselect", options: ["Facebook", "Instagram", "LinkedIn", "TikTok", "X", "YouTube"], allowOther: true },
      { key: "tool", label: "Automation tool", type: "select", options: ["Buffer", "Make", "Zapier", "Hootsuite", "Later", "Metricool"], allowOther: true },
      { key: "languages", label: "Languages", type: "languages", allowOther: true },
      { key: "postsPerWeek", label: "Posts per week", type: "text" },
      { key: "contentSource", label: "Who creates the content", type: "select", options: ["Client provides it", "We create it", "AI-assisted"] },
    ],
    phases: [
      { name: "Tool Setup", tasks: [{ title: "Create {tool} account" }, { title: "Connect {platforms} account", repeat: ["platforms"] }] },
      {
        name: "Content Calendar",
        tasks: [
          { title: "Create content calendar" },
          { title: "Plan {postsPerWeek} posts per week", when: filled("postsPerWeek") },
          { title: "Prepare {languages} content for {platforms}", repeat: ["languages", "platforms"] },
        ],
      },
      { name: "Automation", tasks: [{ title: "Build posting schedule" }, { title: "Build automation workflow" }] },
      { name: "Testing", tasks: [{ title: "Test scheduled post – {platforms}", repeat: ["platforms"] }, { title: "Review first week of posts with the client" }] },
    ],
  },
  APP: {
    fields: [
      { key: "platforms", label: "Platforms", type: "multiselect", options: ["iOS", "Android", "Web"], allowOther: true },
      { key: "research", label: "Research competition", type: "yesno" },
      { key: "mockups", label: "Design mock-ups", type: "yesno" },
      { key: "mockupApproval", label: "Mock-up approval", type: "yesno", showIf: yes("mockups") },
      { key: "approvalBy", label: "Approval by", type: "text", showIf: yes("mockupApproval") },
      {
        key: "features",
        label: "Features",
        type: "multiselect",
        options: ["User login", "Payments", "Notifications", "Admin dashboard", "API integration", "Analytics"],
        allowOther: true,
      },
      { key: "languages", label: "Languages", type: "languages", allowOther: true },
    ],
    phases: [
      { name: "Research", when: yes("research"), tasks: [{ title: "Find competing apps" }, { title: "Take screenshots" }, { title: "Produce report" }] },
      {
        name: "Design",
        when: yes("mockups"),
        tasks: [{ title: "Design mock-ups" }, { title: "Present mock-ups", when: yes("mockupApproval") }, { title: "Get mock-up approval ({approvalBy})", when: yes("mockupApproval") }],
      },
      { name: "Development", tasks: [{ title: "Set up project and environments" }, { title: "Build {features}", repeat: ["features"] }, { title: "Translate app to {languages}", repeat: ["languages"], when: filled("languages") }] },
      { name: "Testing", tasks: [{ title: "Test on {platforms}", repeat: ["platforms"] }, { title: "Fix bugs" }] },
      { name: "Release", tasks: [{ title: "Publish to {platforms}", repeat: ["platforms"] }, { title: "Hand over to the client" }] },
    ],
  },
  CONSULTING: {
    fields: [
      {
        key: "topics",
        label: "Consulting topics",
        type: "multiselect",
        options: ["Funnel strategy", "AI tools deployment", "Traffic generation", "Client acquisition", "Affiliate marketing"],
        allowOther: true,
      },
      { key: "format", label: "Format", type: "select", options: ["Video call", "Phone", "In person"], allowOther: true },
      { key: "discoveryCall", label: "Discovery call", type: "yesno" },
      { key: "report", label: "Written report", type: "yesno" },
    ],
    phases: [
      { name: "Discovery", when: yes("discoveryCall"), tasks: [{ title: "Schedule discovery call ({format})" }, { title: "Run discovery call" }, { title: "Document needs and goals" }] },
      { name: "Strategy", tasks: [{ title: "Prepare strategy – {topics}", repeat: ["topics"] }] },
      { name: "Sessions", tasks: [{ title: "Hold consulting session – {topics}", repeat: ["topics"] }] },
      { name: "Report", when: yes("report"), tasks: [{ title: "Write summary report" }, { title: "Present report" }] },
      { name: "Follow-up", tasks: [{ title: "Follow-up call" }, { title: "Collect feedback" }] },
    ],
  },
  OTHER: {
    fields: [],
    phases: [
      { name: "Planning", tasks: [{ title: "Define goals and scope" }, { title: "Break the work into tasks" }] },
      { name: "Delivery", tasks: [{ title: "Do the work" }, { title: "Deliver to the client" }] },
      { name: "Wrap-up", tasks: [{ title: "Collect feedback" }, { title: "Send final invoice" }] },
    ],
  },
  STORE: {
    fields: [
      { key: "app", label: "Store platform", type: "select", options: ["Shopify", "WooCommerce", "Systeme.io", "ClickFunnels", "Squarespace", "Wix"], allowOther: true },
      { key: "domainSetup", label: "Domain setup", type: "yesno" },
      { key: "registrar", label: "Registrar", type: "text", showIf: yes("domainSetup") },
      { key: "dnsProvider", label: "DNS Provider", type: "text", showIf: yes("domainSetup") },
      { key: "products", label: "Number of products", type: "text" },
      { key: "payments", label: "Payment gateways", type: "multiselect", options: ["Stripe", "PayPal", "Square"], allowOther: true },
      { key: "shipping", label: "Shipping setup", type: "yesno" },
      { key: "taxes", label: "Tax setup", type: "yesno" },
      { key: "languages", label: "Languages", type: "languages", allowOther: true },
    ],
    phases: [
      { name: "Planning", tasks: [{ title: "Define product catalog and categories" }, { title: "Collect product photos and descriptions" }] },
      { name: "Domain Setup", when: yes("domainSetup"), tasks: [{ title: "Buy domain" }, { title: "Setup domain (DNS: {dnsProvider})" }] },
      {
        name: "Store Setup",
        tasks: [
          { title: "Create {app} store" },
          { title: "Connect {payments}", repeat: ["payments"], when: filled("payments") },
          { title: "Configure shipping", when: yes("shipping") },
          { title: "Configure taxes", when: yes("taxes") },
          { title: "Design store theme and pages" },
        ],
      },
      { name: "Products", tasks: [{ title: "Add {products} products ({languages})", repeat: ["languages"] }] },
      { name: "Testing", tasks: [{ title: "Place a test order" }, { title: "Test checkout and payment ({payments})", repeat: ["payments"] }, { title: "Test on mobile" }] },
      { name: "Launch", tasks: [{ title: "Go live" }, { title: "Hand over to the client" }] },
    ],
  },
  CRM_CUSTOMIZATION: {
    fields: [
      { key: "crm", label: "CRM", type: "select", options: ["AMO CRM", "Systeme.io", "GoHighLevel", "HubSpot", "Zoho", "Pipedrive", "ClickFunnels"], allowOther: true },
      { key: "importContacts", label: "Import existing contacts", type: "yesno" },
      { key: "customFields", label: "Custom fields", type: "yesno" },
      { key: "pipelines", label: "Pipelines / stages", type: "yesno" },
      { key: "automations", label: "Automations", type: "yesno" },
      { key: "integrations", label: "Integrations", type: "multiselect", options: ["Email", "Calendar", "SMS", "Forms", "Payments", "Accounting"], allowOther: true },
    ],
    phases: [
      { name: "Discovery", tasks: [{ title: "Map the client's current process" }, { title: "List what needs customizing in {crm}" }] },
      { name: "Data", when: yes("importContacts"), tasks: [{ title: "Clean the contact list" }, { title: "Import contacts into {crm}" }, { title: "Check imported data" }] },
      {
        name: "Customization",
        tasks: [
          { title: "Create custom fields", when: yes("customFields") },
          { title: "Build pipelines and stages", when: yes("pipelines") },
          { title: "Set up tags and views" },
        ],
      },
      { name: "Integrations", when: filled("integrations"), tasks: [{ title: "Connect {integrations}", repeat: ["integrations"] }] },
      { name: "Automations", when: yes("automations"), tasks: [{ title: "Build CRM automations" }, { title: "Test automations" }] },
      { name: "Training & Handover", tasks: [{ title: "Train the client's team" }, { title: "Document the setup" }] },
    ],
  },
  AUTOMATION: {
    fields: [
      { key: "tool", label: "Automation tool", type: "select", options: ["Make", "Zapier", "n8n", "Systeme.io", "GoHighLevel"], allowOther: true },
      { key: "complexity", label: "Complexity", type: "select", options: ["Simple", "Standard", "Advanced"] },
      { key: "apps", label: "Apps to connect", type: "multiselect", options: [], allowOther: true },
      { key: "workflows", label: "Workflows to build", type: "multiselect", options: [], allowOther: true },
      { key: "documentation", label: "Documentation", type: "yesno" },
    ],
    phases: [
      { name: "Scoping", tasks: [{ title: "Map each workflow step by step" }, { title: "Confirm triggers, actions and error handling" }] },
      { name: "Connections", when: filled("apps"), tasks: [{ title: "Connect {apps} to {tool}", repeat: ["apps"] }] },
      { name: "Build", tasks: [{ title: "Build workflow: {workflows}", repeat: ["workflows"] }] },
      { name: "Testing", tasks: [{ title: "Test with real data" }, { title: "Test error cases" }] },
      { name: "Documentation", when: yes("documentation"), tasks: [{ title: "Write workflow documentation" }] },
      { name: "Handover", tasks: [{ title: "Walk the client through the automations" }, { title: "Turn automations on" }] },
    ],
  },
  EMAIL_MARKETING: {
    fields: [
      { key: "esp", label: "Email platform", type: "select", options: ["GetResponse", "Systeme.io", "Mailchimp", "ClickFunnels", "GoHighLevel", "Brevo", "Kit"], allowOther: true },
      { key: "languages", label: "Languages", type: "languages", allowOther: true },
      { key: "domainAuth", label: "Sender domain authentication", type: "yesno" },
      { key: "listImport", label: "Import an existing list", type: "yesno" },
      { key: "sequences", label: "Email sequences", type: "multiselect", options: ["Welcome", "Nurture", "Abandoned cart", "Promotional", "Re-engagement"], allowOther: true },
    ],
    phases: [
      {
        name: "Setup",
        tasks: [
          { title: "Create {esp} account" },
          { title: "Authenticate sender domain (SPF, DKIM, DMARC)", when: yes("domainAuth") },
          { title: "Import and clean the list", when: yes("listImport") },
          { title: "Create sign-up forms" },
        ],
      },
      { name: "Email Design", tasks: [{ title: "Design email template" }, { title: "Get template approval" }] },
      { name: "Sequences", when: filled("sequences"), tasks: [{ title: "Write {languages} {sequences} sequence", repeat: ["languages", "sequences"] }] },
      { name: "Automation", tasks: [{ title: "Build sequence automations and tags" }] },
      { name: "Testing & Launch", tasks: [{ title: "Send test emails" }, { title: "Check deliverability" }, { title: "Launch" }] },
    ],
  },
  SMS_MARKETING: {
    fields: [
      { key: "provider", label: "SMS provider", type: "select", options: ["Twilio", "GoHighLevel", "SimpleTexting", "Textedly"], allowOther: true },
      { key: "numberSetup", label: "Set up a sending number", type: "yesno" },
      { key: "optIn", label: "Opt-in / consent collection", type: "yesno" },
      { key: "languages", label: "Languages", type: "languages", allowOther: true },
      { key: "campaigns", label: "Campaigns", type: "multiselect", options: ["Welcome", "Promotions", "Appointment reminders", "Follow-up"], allowOther: true },
    ],
    phases: [
      { name: "Setup", tasks: [{ title: "Create {provider} account" }, { title: "Provision a sending number", when: yes("numberSetup") }] },
      { name: "Compliance", when: yes("optIn"), tasks: [{ title: "Build opt-in form with consent wording (CASL / TCPA)" }, { title: "Add STOP / unsubscribe handling" }] },
      { name: "Campaigns", when: filled("campaigns"), tasks: [{ title: "Write {languages} {campaigns} messages", repeat: ["languages", "campaigns"] }] },
      { name: "Testing & Launch", tasks: [{ title: "Send test messages" }, { title: "Check delivery and replies" }, { title: "Launch" }] },
    ],
  },
  TRAINING: {
    fields: [
      { key: "topics", label: "Topics", type: "multiselect", options: [], allowOther: true },
      { key: "format", label: "Format", type: "select", options: ["One-on-one", "Group", "Workshop"], allowOther: true },
      { key: "sessions", label: "Number of sessions", type: "text" },
      { key: "languages", label: "Languages", type: "languages", allowOther: true },
      { key: "materials", label: "Training materials needed", type: "yesno" },
      { key: "recordings", label: "Record sessions", type: "yesno" },
    ],
    phases: [
      { name: "Preparation", tasks: [{ title: "Define learning goals" }, { title: "Prepare training materials", when: yes("materials") }, { title: "Schedule {sessions} sessions ({format})" }] },
      { name: "Sessions", tasks: [{ title: "Deliver session: {topics}", repeat: ["topics"] }] },
      { name: "Follow-up", tasks: [{ title: "Send session recordings", when: yes("recordings") }, { title: "Send summary and next steps" }, { title: "Collect feedback" }] },
    ],
  },
  AFFILIATE_MARKETING: {
    fields: [
      { key: "programs", label: "Affiliate programs", type: "multiselect", options: [], allowOther: true },
      { key: "platforms", label: "Promotion platforms", type: "multiselect", options: ["Facebook", "Instagram", "LinkedIn", "TikTok", "X", "YouTube"], allowOther: true },
      { key: "languages", label: "Languages", type: "languages", allowOther: true },
      { key: "leadMagnet", label: "Lead magnet", type: "yesno" },
      { key: "bridgePage", label: "Bridge / review page", type: "yesno" },
      { key: "emailSequence", label: "Email follow-up sequence", type: "yesno" },
      { key: "tracking", label: "Tracking links", type: "yesno" },
    ],
    phases: [
      { name: "Research", tasks: [{ title: "Compare programs and commissions" }, { title: "Apply to {programs}", repeat: ["programs"], when: filled("programs") }] },
      { name: "Funnel & Content", tasks: [{ title: "Create lead magnet", when: yes("leadMagnet") }, { title: "Build bridge page ({languages})", repeat: ["languages"], when: yes("bridgePage") }, { title: "Write follow-up email sequence ({languages})", repeat: ["languages"], when: yes("emailSequence") }] },
      { name: "Tracking", when: yes("tracking"), tasks: [{ title: "Create tracking links for {programs}", repeat: ["programs"] }] },
      { name: "Promotion", when: filled("platforms"), tasks: [{ title: "Publish promotion on {platforms} ({languages})", repeat: ["platforms", "languages"] }] },
      { name: "Review", tasks: [{ title: "Review clicks and conversions" }] },
    ],
  },
};

// Lifecycle for the built-in templates: Proposal first; research / mock-up
// style phases belong to Planning; everything else to Active (with Presenting
// and Deploying added if missing); Final Payment last.
const PLANNING_STAGE_NAMES = /^(research|mock-?up|model|design|discovery|scoping|catalog planning|preparation)$/i;

function applyLifecycle(template: TemplateConfig): void {
  for (const phase of template.phases) phase.stage = PLANNING_STAGE_NAMES.test(phase.name) ? "PLANNING" : "ACTIVE";
  const names = template.phases.map((p) => p.name.toLowerCase());
  if (!names.some((n) => /present/.test(n))) {
    template.phases.push({ name: "Presenting", stage: "ACTIVE", tasks: [{ title: "Present the work to the client" }, { title: "Collect feedback and approval" }] });
  }
  if (!names.some((n) => /deploy|launch|release|handover|delivery|wrap-up/.test(n))) {
    template.phases.push({ name: "Deploying", stage: "ACTIVE", tasks: [{ title: "Make the final adjustments" }, { title: "Deploy / go live" }] });
  }
  template.phases.push({
    name: "Final Payment",
    stage: "FINAL",
    tasks: [{ title: "Send the final invoice" }, { title: "Receive the final instalment" }],
  });
  template.phases.unshift(planningPhase());
}

// Model -> Mock-up, Design -> Mock-up (what the client reviews and accepts).
for (const template of Object.values(DEFAULT_TEMPLATES)) {
  for (const phase of template.phases) {
    if (phase.name === "Model" || phase.name === "Design") phase.name = "Mock-up";
    if (phase.name === "Planning") phase.name = "Catalog Planning";
  }
  applyLifecycle(template);
}

export function defaultTemplate(type: string): TemplateConfig {
  return DEFAULT_TEMPLATES[type] ?? { fields: [], phases: [] };
}

// ---- multi-type projects ----------------------------------------------------

// "Create a brand for the client": a Yes/No in every type's details. Any Yes adds
// the (shared) Brand phase to the project.
export const BRAND_FIELD: FieldTpl = { key: "brand", label: "Create a brand for the client", type: "yesno" };

for (const type of PROJECT_TYPE_ORDER) {
  const template = DEFAULT_TEMPLATES[type];
  if (template && !template.fields.some((f) => f.key === BRAND_FIELD.key)) template.fields.push({ ...BRAND_FIELD });
}

// Saved (customized) templates predate the Brand question: add it when missing.
export function withBrandField(config: TemplateConfig): TemplateConfig {
  return config.fields.some((f) => f.key === BRAND_FIELD.key) ? config : { ...config, fields: [...config.fields, { ...BRAND_FIELD }] };
}

export const BRAND_PHASE_TASKS = [
  "Collect the client's existing brand assets",
  "Define the brand voice and style",
  "Create the logo",
  "Choose the colours and fonts",
  "Create the brand guide",
  "Add the brand to the client's Brand card",
];

export interface TypeInput {
  type: string;
  label: string;
  template: TemplateConfig;
  values: FieldValues;
}

type PlanPhase = ProjectPlan["phases"][number];

const SHARED_NAMES: Record<string, string> = {
  proposal: "Proposal",
  research: "Research",
  "mock-up": "Mock-up",
  mockup: "Mock-up",
  model: "Mock-up",
  design: "Mock-up",
  presenting: "Presenting",
  deploying: "Deploying",
  "final payment": "Final Payment",
};

// One project, several types of work: every type contributes its own phases, but
// the shared ones — Proposal, Research, Brand, Mock-up, and the closing Presenting,
// Deploying and Final Payment — appear once, with the tasks of every type merged.
// Order: Proposal, planning (Research, Brand, Mock-up, then the types' own planning
// phases), the types' building phases in the order of the types, Presenting,
// Deploying, Final Payment.
export function buildMultiPlan(inputs: TypeInput[]): ProjectPlan {
  const multi = inputs.length > 1;
  const shared = new Map<string, PlanPhase>();
  const own: PlanPhase[] = [];
  let brand = false;

  for (const input of inputs) {
    const values = cleanValues(input.template, input.values);
    if (values[BRAND_FIELD.key] === "Y") brand = true;
    for (const phase of buildPlan(input.template, values).phases) {
      const key = SHARED_NAMES[phase.name.trim().toLowerCase()];
      if (key) {
        const existing = shared.get(key);
        if (!existing) shared.set(key, { ...phase, name: key, tasks: [...phase.tasks] });
        else for (const t of phase.tasks) if (!existing.tasks.includes(t)) existing.tasks.push(t);
      } else {
        own.push({ ...phase, name: multi ? `${input.label} — ${phase.name}` : phase.name });
      }
    }
  }

  const pick = (name: string) => (shared.has(name) ? [shared.get(name)!] : []);
  const brandPhase: PlanPhase[] = brand ? [{ name: "Brand", stage: "PLANNING", tasks: [...BRAND_PHASE_TASKS] }] : [];
  const phases: PlanPhase[] = [
    ...pick("Proposal"),
    ...pick("Research"),
    ...brandPhase,
    ...pick("Mock-up"),
    ...own.filter((p) => p.stage === "PLANNING"),
    ...own.filter((p) => p.stage === "ACTIVE"),
    ...own.filter((p) => p.stage === "PROPOSAL" || p.stage === "FINAL"),
    ...pick("Presenting"),
    ...pick("Deploying"),
    ...pick("Final Payment"),
  ];
  return { phases };
}

/** The types of a project in order (falls back to the single legacy `type`). */
export function typesOfProject(p: { type: string; types?: string[] | null }): string[] {
  return p.types && p.types.length > 0 ? p.types : [p.type];
}

/** One type's answers from a project's `typeFields` (legacy `customFields` for its first type). */
export function valuesOfType(p: { type: string; typeFields?: unknown; customFields?: unknown }, type: string): FieldValues {
  const tf = (p.typeFields ?? null) as Record<string, FieldValues> | null;
  if (tf && tf[type]) return tf[type];
  return type === p.type ? ((p.customFields ?? {}) as FieldValues) : {};
}
