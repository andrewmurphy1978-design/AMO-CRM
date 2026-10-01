// Project-type templates: for each type of project, the custom fields asked
// for when a project is created, and the phases/tasks generated from the
// answers. Pure data + functions (no server imports) so the same code runs
// in the New Project form, the server action and the customization page.
//
// A template is plain JSON, stored per type in ProjectTypeTemplate; types
// with no saved row fall back to DEFAULT_TEMPLATES below.

export type FieldType = "yesno" | "text" | "textarea" | "url" | "select" | "multiselect" | "languages";

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
  // A Yes/No field that, when Yes, also creates a separate project of this
  // type (e.g. Blog -> a "Blog building" project for the same client).
  spawnType?: string;
  spawnName?: string;
}

export interface TaskTpl {
  title: string;
  when?: Cond;
  // Field keys (multiselect/languages) to repeat the task for — one task per
  // combination; {key} in the title is replaced by the current value.
  repeat?: string[];
}

export interface PhaseTpl {
  name: string;
  when?: Cond;
  tasks: TaskTpl[];
}

export interface TemplateConfig {
  fields: FieldTpl[];
  phases: PhaseTpl[];
}

export type FieldValues = Record<string, string | string[]>;

export const TEMPLATE_TYPES = ["WEBSITE", "FUNNEL", "SOCIAL_MEDIA", "BLOG", "NEWSLETTER", "POST_AUTOMATION", "APP", "CONSULTING", "OTHER"] as const;

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

export function isFieldVisible(field: FieldTpl, values: FieldValues): boolean {
  return evalCond(field.showIf, values);
}

// Drops answers to fields that are hidden (their showIf no longer holds) or
// that no longer exist in the template.
export function cleanValues(config: TemplateConfig, values: FieldValues): FieldValues {
  const out: FieldValues = {};
  for (const field of config.fields) {
    if (!isFieldVisible(field, values)) continue;
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

export interface ProjectPlan {
  phases: { name: string; tasks: string[] }[];
  spawns: { type: string; name: string }[];
}

// Turns a template + the answers into the phases/tasks to create, and the
// extra projects to spawn. Phases with a false condition (or no tasks left
// and a condition) are skipped.
export function buildPlan(config: TemplateConfig, rawValues: FieldValues, projectName: string): ProjectPlan {
  const values = cleanValues(config, rawValues);
  const phases: ProjectPlan["phases"] = [];
  for (const phase of config.phases) {
    if (!evalCond(phase.when, values)) continue;
    const titles: string[] = [];
    for (const task of phase.tasks) {
      if (!evalCond(task.when, values)) continue;
      for (const title of expandTitle(task, values)) if (title && !titles.includes(title)) titles.push(title);
    }
    phases.push({ name: tidy(phase.name), tasks: titles });
  }
  const spawns: ProjectPlan["spawns"] = [];
  for (const field of config.fields) {
    if (field.spawnType && values[field.key] === "Y") {
      spawns.push({ type: field.spawnType, name: field.spawnName?.trim() ? field.spawnName.replace("{project}", projectName) : `${projectName} – ${field.label}` });
    }
  }
  return { phases, spawns };
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
    const label = str(f?.label).trim();
    if (!label) continue;
    let key = str(f?.key).trim() || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
    while (seen.has(key)) key += "_2";
    seen.add(key);
    const type = (["yesno", "text", "textarea", "url", "select", "multiselect", "languages"] as const).includes(f?.type as FieldType) ? (f.type as FieldType) : "text";
    fields.push({
      key,
      label,
      type,
      ...(Array.isArray(f?.options) ? { options: f.options.map(str).map((o: string) => o.trim()).filter(Boolean) } : {}),
      ...(f?.allowOther ? { allowOther: true } : {}),
      ...(cond(f?.showIf) ? { showIf: cond(f?.showIf) } : {}),
      ...(type === "yesno" && f?.spawnType ? { spawnType: str(f.spawnType), ...(f.spawnName ? { spawnName: str(f.spawnName) } : {}) } : {}),
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
    phases.push({ name, ...(cond(p?.when) ? { when: cond(p?.when) } : {}), tasks });
  }
  return { fields, phases };
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
    { key: "model", label: "Model", type: "yesno" },
    { key: "modelApproval", label: "Model approval", type: "yesno", showIf: yes("model") },
    { key: "modelApprovalBy", label: "Model approval by", type: "text", showIf: yes("modelApproval") },
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
      name: "Model",
      when: yes("model"),
      tasks: [
        { title: "Build model" },
        { title: "Present model", when: yes("modelApproval") },
        { title: "Get model approval from {modelApprovalBy}", when: yes("modelApproval") },
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
        { title: "Setup {app}" },
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
      { key: "blog", label: "Blog", type: "yesno", spawnType: "BLOG", spawnName: "{project} – Blog" },
      { key: "newsletters", label: "Newsletters", type: "yesno", spawnType: "NEWSLETTER", spawnName: "{project} – Newsletters" },
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
      { key: "postAutomation", label: "Post automation", type: "yesno", spawnType: "POST_AUTOMATION", spawnName: "{project} – Post automation" },
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
};

export function defaultTemplate(type: string): TemplateConfig {
  return DEFAULT_TEMPLATES[type] ?? { fields: [], phases: [] };
}
