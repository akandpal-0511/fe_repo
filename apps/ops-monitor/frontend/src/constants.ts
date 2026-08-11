export const DARK_C = {
  BG:     "#0d1117",
  CARD:   "#161b27",
  CARD2:  "#1c2333",
  BORDER: "#2d3348",
  ACCENT: "#58a6ff",
  TEXT:   "#e6edf3",
  MUTED:  "#7d8590",
  OK:     "#3fb950",
  WARN:   "#d29922",
  ALARM:  "#f85149",
  OFF:    "#484f58",
} as const;

export const LIGHT_C = {
  BG:     "#f6f8fa",
  CARD:   "#ffffff",
  CARD2:  "#eef1f5",
  BORDER: "#d0d7de",
  ACCENT: "#0969da",
  TEXT:   "#1f2328",
  MUTED:  "#57606a",
  OK:     "#1a7f37",
  WARN:   "#9a6700",
  ALARM:  "#cf222e",
  OFF:    "#6e7781",
} as const;

export const GENIE_ONE_URL = "https://fevm-serverless-stable-82bi8w.cloud.databricks.com/genie/rooms";

// backward-compat alias — prefer useTheme() in components
export const C = DARK_C;

// Product name — shown in the header, landing page and browser title.
export const APP_NAME = "Mine Operations Monitor";

// ── Process-area flowsheet ──────────────────────────────────────────────────
// A commodity-neutral mining value chain. The backend keys every sensor by a
// stable "PA-N" id; PA_LABELS maps each id to a human-readable step that reads
// for any metal (gold, silver, copper, …). To re-skin this demo for a different
// operation, edit the labels here — nothing else needs to change.
export const PA_ORDER = [
  "PA-1", "PA-2", "PA-3", "PA-4", "PA-5", "PA-6", "PA-7",
  "PA-8", "PA-9", "PA-10", "PA-11", "PA-12", "PA-13",
] as const;

export const PA_LABELS: Record<string, string> = {
  "PA-1":  "Mining",
  "PA-2":  "Crushing",
  "PA-3":  "Grinding / Milling",
  "PA-4":  "Material Handling",
  "PA-5":  "Leaching",
  "PA-6":  "Concentration",
  "PA-7":  "Solution Processing",
  "PA-8":  "Recovery",
  "PA-9":  "Product / Refining",
  "PA-10": "Reagents",
  "PA-11": "Water & Solution Balance",
  "PA-12": "Tailings",
  "PA-13": "Assays & Met Accounting",
};

/** Human-readable label for a process-area id (falls back to the id itself). */
export function paLabel(pa: string): string {
  return PA_LABELS[pa] ?? pa;
}

// ── Material type colours for the stacking table ──────────────────────────────

const MATERIAL_COLORS_DARK: Record<string, { bg: string; text: string }> = {
  "Type-A": { bg: "#1e3a6e", text: "#a8c4f0" },
  "Type-B": { bg: "#6b3010", text: "#f0b98a" },
  "Type-C": { bg: "#1a4d1a", text: "#88d488" },
  "Type-D": { bg: "#3d2e00", text: "#ffc000" },
  "Type-E": { bg: "#e8ecf0", text: "#1f2b3a" },
};

const MATERIAL_COLORS_LIGHT: Record<string, { bg: string; text: string }> = {
  "Type-A": { bg: "#4472C4", text: "#ffffff" },
  "Type-B": { bg: "#E8834A", text: "#ffffff" },
  "Type-C": { bg: "#70AD47", text: "#ffffff" },
  "Type-D": { bg: "#FFC000", text: "#4a3000" },
  "Type-E": { bg: "#f6f8fa", text: "#1f2328" },
};

export function getMaterialColors(theme: "dark" | "light") {
  return theme === "dark" ? MATERIAL_COLORS_DARK : MATERIAL_COLORS_LIGHT;
}

export const MATERIAL_LEGEND: { label: string; color: string }[] = [
  { label: "Type-E", color: "#ffffff" },
  { label: "Type-D", color: "#FFC000" },
  { label: "Type-C", color: "#70AD47" },
  { label: "Type-B", color: "#E8834A" },
  { label: "Type-A", color: "#4472C4" },
];
