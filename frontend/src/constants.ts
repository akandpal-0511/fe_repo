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

export const PERF_AREAS = [
  "Dashboard",
  "Stacking Plan Status",
  "3D Heap Viewer",
  "Multi-PA Analysis",
  "Causality",
  "Predict",
  "Ask Genie",
] as const;

export const BIGF_AREAS = ["BIGF1", "BIGF2", "BIGF3", "BIGF4"] as const;

export const PERF_AREA_TO_GOLD: Record<string, string> = {
  Stacking: "jcm_process_data_stacking",
};

// ── Material type colours for the stacking table ──────────────────────────────

const MATERIAL_COLORS_DARK: Record<string, { bg: string; text: string }> = {
  "Non-core BQ":    { bg: "#1e3a6e", text: "#a8c4f0" },
  "Non-core blend": { bg: "#6b3010", text: "#f0b98a" },
  "PV":             { bg: "#1a4d1a", text: "#88d488" },
  "Core edge":      { bg: "#3d2e00", text: "#ffc000" },
  "Core":           { bg: "#e8ecf0", text: "#1f2b3a" },
};

const MATERIAL_COLORS_LIGHT: Record<string, { bg: string; text: string }> = {
  "Non-core BQ":    { bg: "#4472C4", text: "#ffffff" },
  "Non-core blend": { bg: "#E8834A", text: "#ffffff" },
  "PV":             { bg: "#70AD47", text: "#ffffff" },
  "Core edge":      { bg: "#FFC000", text: "#4a3000" },
  "Core":           { bg: "#f6f8fa", text: "#1f2328" },
};

export function getMaterialColors(theme: "dark" | "light") {
  return theme === "dark" ? MATERIAL_COLORS_DARK : MATERIAL_COLORS_LIGHT;
}

export const MATERIAL_LEGEND: { label: string; color: string }[] = [
  { label: "Core",           color: "#ffffff" },
  { label: "Core edge",      color: "#FFC000" },
  { label: "PV",             color: "#70AD47" },
  { label: "Non-core blend", color: "#E8834A" },
  { label: "Non-core BQ",    color: "#4472C4" },
];
