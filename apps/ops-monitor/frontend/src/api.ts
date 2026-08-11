import type {
  TagProfile, LatestValue, TrendPoint, KPICard,
  StackingRow, OreFeedPoint, CommentRow,
  HeatmapResponse, NetworkResponse, CausalityEdge,
  EarlyWarningSensor,
} from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json();
}

// Named exports for StackingTab (dev branch style)
export function fetchStackingAllocation(): Promise<import("./types").StackingRow[]> {
  return get("/api/stacking/cell-allocation");
}
export function fetchOreFeedRate(): Promise<import("./types").OreFeedPoint[]> {
  return get("/api/stacking/ore-feed-rate");
}

export const api = {
  // Tag profiles
  allProfiles:   ()                                     => get<TagProfile[]>("/api/tag-profiles"),
  areaProfiles:  (area: string)                         => get<TagProfile[]>(`/api/tag-profiles/${encodeURIComponent(area)}`),

  // Latest values + trends
  latestValues:  ()                                     => get<LatestValue[]>("/api/latest-values"),
  gold:          (table: string)                        => get<Record<string, unknown>>(`/api/gold/${table}`),
  trends:        (tags: string[], start: string, end: string) =>
    get<TrendPoint[]>(`/api/trends?tags=${tags.map(encodeURIComponent).join(",")}&start=${start}&end=${end}`),
  kpis:          (area: string)                         => get<KPICard[]>(`/api/kpis/${encodeURIComponent(area)}`),

  // Plan Status
  stackingAllocation: (mode: "prod" | "test" = "prod") =>
    get<StackingRow[]>(`/api/stacking/cell-allocation?mode=${mode}`),
  oreFeedRate: (days = 7) =>
    get<OreFeedPoint[]>(`/api/stacking/ore-feed-rate?days=${days}`),

  // Cache
  clearCache: () => fetch("/api/cache/clear", { method: "POST" }).then(r => r.json()),

  // Comments (in-memory)
  comments:    (area: string) => get<CommentRow[]>(`/api/comments?area=${encodeURIComponent(area)}`),
  addComment:  (body: { area: string; category: string; text: string; tag_name?: string }) =>
    post<{ status: string }>("/api/comments", body),
  deleteComment: (id: number, area: string) =>
    fetch(`/api/comments/${id}?area=${encodeURIComponent(area)}`, { method: "DELETE" }).then(r => r.json()),

  // Causality
  causalityHeatmap: (body: { areas: string[]; start: string; end: string; max_lag_hours: number }) =>
    post<HeatmapResponse>("/api/causality/heatmap", body),
  causalityNetwork: (body: { areas: string[]; start: string; end: string; max_lag_hours: number; threshold: number }) =>
    post<NetworkResponse>("/api/causality/network", body),
  causalityGranger: (body: { edges: CausalityEdge[]; start: string; end: string; max_lag_hours: number }) =>
    post<CausalityEdge[]>("/api/causality/granger", body),
  earlyWarning: (body: { target_tag: string; areas: string[]; start: string; end: string; max_lag_hours: number; threshold: number; top_n: number }) =>
    post<EarlyWarningSensor[]>("/api/causality/early-warning", body),
};
