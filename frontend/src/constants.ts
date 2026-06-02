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

// backward-compat alias — prefer useTheme() in components
export const C = DARK_C;

export const PERF_AREAS = [
  "Sensor Trends",
  "Multi-PA Analysis",
  "Stacking",
  "3D Explorer",
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
  "Core edge":      { bg: "#5a4a10", text: "#e0cc80" },
  "Core":           { bg: "#2a2a3a", text: "#c8c8d8" },
};

const MATERIAL_COLORS_LIGHT: Record<string, { bg: string; text: string }> = {
  "Non-core BQ":    { bg: "#d0e4ff", text: "#1a3a7a" },
  "Non-core blend": { bg: "#fde0c8", text: "#7a3010" },
  "PV":             { bg: "#cff0cf", text: "#1a5c2a" },
  "Core edge":      { bg: "#fdf0c8", text: "#7a5010" },
  "Core":           { bg: "#ebebeb", text: "#3a3a4a" },
};

export function getMaterialColors(theme: "dark" | "light") {
  return theme === "dark" ? MATERIAL_COLORS_DARK : MATERIAL_COLORS_LIGHT;
}

export const MATERIAL_LEGEND: { label: string; color: string }[] = [
  { label: "Non-core BQ",    color: "#4472C4" },
  { label: "Non-core blend", color: "#E8834A" },
  { label: "PV",             color: "#70AD47" },
  { label: "Core edge",      color: "#C2A64B" },
  { label: "Core",           color: "#8c8c9e" },
];
