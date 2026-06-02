import type { TagProfile, LatestValue, TrendPoint, KPICard, BioReactorResponse, StackingRow, OreFeedPoint } from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json();
}

export const api = {
  allProfiles:   ()                                     => get<TagProfile[]>("/api/tag-profiles"),
  areaProfiles:  (area: string)                         => get<TagProfile[]>(`/api/tag-profiles/${encodeURIComponent(area)}`),
  latestValues:  ()                                     => get<LatestValue[]>("/api/latest-values"),
  gold:          (table: string)                        => get<Record<string, unknown>>(`/api/gold/${table}`),
  trends:        (tags: string[], start: string, end: string) =>
    get<TrendPoint[]>(`/api/trends?tags=${tags.map(encodeURIComponent).join(",")}&start=${start}&end=${end}`),
  kpis:          (area: string)                         => get<KPICard[]>(`/api/kpis/${encodeURIComponent(area)}`),
  bigfProfiles:  ()                                     => get<Record<string, { Description: string; Tag: string }[]>>("/api/bigf-profiles"),
  clearCache:    ()                                     => fetch("/api/cache/clear", { method: "POST" }),
  bioReactorDaily: (measures: string[], start: string, end: string) =>
    get<BioReactorResponse>(`/api/bio-reactor-daily?measures=${measures.map(encodeURIComponent).join(",")}&start=${start}&end=${end}`),
  stackingAllocation: (mode: "prod" | "test" = "prod") =>
    get<StackingRow[]>(`/api/stacking/cell-allocation?mode=${mode}`),
  oreFeedRate: (days = 7) =>
    get<OreFeedPoint[]>(`/api/stacking/ore-feed-rate?days=${days}`),
};
