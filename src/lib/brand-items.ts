// What a brand project can include. Each ticked item becomes a task of the Brand phase.
export interface BrandItem {
  key: string;
  label: string;
  labelFr: string;
  task: string;
}

export const BRAND_ITEMS: BrandItem[] = [
  { key: "logos", label: "Logos", labelFr: "Logos", task: "Create the logo (main, horizontal, icon-only, light and dark versions)" },
  { key: "colours", label: "Colours", labelFr: "Couleurs", task: "Choose the colour palette (primary, secondary, accent, neutrals)" },
  { key: "fonts", label: "Fonts", labelFr: "Polices", task: "Choose the fonts (headings, body, accents)" },
  { key: "icons", label: "Icons", labelFr: "Icônes", task: "Create the icon set" },
  { key: "components", label: "Components", labelFr: "Composants", task: "Design the interface components (buttons, forms, cards, navigation)" },
  { key: "graphics", label: "Graphics & patterns", labelFr: "Graphiques et motifs", task: "Create the graphics and patterns" },
  { key: "photos", label: "Photos", labelFr: "Photos", task: "Define the photo style and collect the photos" },
  { key: "charts", label: "Charts", labelFr: "Diagrammes", task: "Define the chart and data-visualization style" },
  { key: "voice", label: "Voice & tone", labelFr: "Voix et ton", task: "Define the brand voice and tone" },
  { key: "guide", label: "Brand guide", labelFr: "Guide de marque", task: "Create the brand guide (PDF)" },
];

// Ticked by default when "Create a brand" is chosen and nothing was picked.
export const DEFAULT_BRAND_ITEMS = ["logos", "colours", "fonts", "voice", "guide"];

// The last task of the Brand phase: done by hand (the Approve button) once the guides are reviewed and approved.
export const REVIEW_BRAND_TASK = "Review the brand guides";

export function brandPhaseTasks(items: string[] | null | undefined): string[] {
  const chosen = items && items.length > 0 ? items : DEFAULT_BRAND_ITEMS;
  return [
    "Collect the client's existing brand assets",
    ...BRAND_ITEMS.filter((b) => chosen.includes(b.key)).map((b) => b.task),
    "Add the brand to the client's Brand card",
    REVIEW_BRAND_TASK,
  ];
}
