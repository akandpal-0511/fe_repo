import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { useTheme } from "../theme";
import { api } from "../api";
import { CommentsPanel } from "../components/CommentsPanel";
import type { TagProfile, TrendPoint } from "../types";

const DASHBOARD_AREAS = [
  "PA-1", "PA-2", "PA-3", "PA-4", "PA-5",
  "PA-6", "PA-7", "PA-8", "PA-9", "PA-10", "PA-11", "PA-12",
];

function isoNDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}
function isoToday() { return new Date().toISOString().slice(0, 10); }

function pickChartTags(profiles: TagProfile[]): TagProfile[] {
  return profiles.filter(p => !p.IsCalculated && p.DataSource?.toLowerCase().includes("historian")).slice(0, 4);
}

function groupByTag(points: TrendPoint[]): Record<string, TrendPoint[]> {
  const out: Record<string, TrendPoint[]> = {};
  for (const p of points) { if (!out[p.Tag]) out[p.Tag] = []; out[p.Tag].push(p); }
  return out;
}

// Bucket trend points into weekly avg for bar chart
function weeklyBuckets(pts: TrendPoint[]): { week: string; avg: number }[] {
  const byWeek: Record<string, number[]> = {};
  for (const p of pts) {
    if (p.Value == null) continue;
    const d = new Date(p.Timestamp_AZ);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(p.Value as number);
  }
  return Object.entries(byWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, vals]) => ({ week, avg: vals.reduce((s, v) => s + v, 0) / vals.length }));
}

const CHART_COLORS = ["#58a6ff", "#f0883e", "#3fb950", "#d29922", "#a371f7", "#79c0ff"];

// ── KPI Weekly view ────────────────────────────────────────────────────────────

const TIME_PERIODS = [
  { label: "Latest Week",   weeks: 1 },
  { label: "Last 2 Weeks",  weeks: 2 },
  { label: "Last 4 Weeks",  weeks: 4 },
  { label: "Last 8 Weeks",  weeks: 8 },
] as const;

function KpiWeeklyView({ area }: { area: string }) {
  const { C } = useTheme();
  const [profiles,     setProfiles]     = useState<TagProfile[]>([]);
  const [latestValues, setLatestValues] = useState<Record<string, number | null>>({});
  const [tableLoading, setTableLoading] = useState(true);
  const [trendPoints,  setTrendPoints]  = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [dateRange,    setDateRange]    = useState<"7d" | "30d" | "90d">("30d");
  const [timePeriod,   setTimePeriod]   = useState<typeof TIME_PERIODS[number]["label"]>("Latest Week");

  const selectedPeriod = TIME_PERIODS.find(p => p.label === timePeriod) ?? TIME_PERIODS[0];

  // Week range label based on selected period
  const now = new Date();
  const periodEnd   = new Date(now); periodEnd.setDate(now.getDate() - now.getDay() + 7); // end of this week
  const periodStart = new Date(periodEnd); periodStart.setDate(periodEnd.getDate() - selectedPeriod.weeks * 7);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const weekLabel = `${fmt(periodStart)} - ${fmt(periodEnd)}`;

  useEffect(() => {
    setTableLoading(true);
    Promise.all([
      api.areaProfiles(area),
      api.latestValues(),
    ]).then(([profs, latest]) => {
      setProfiles(profs);
      const map: Record<string, number | null> = {};
      for (const lv of latest) map[lv.Tag] = lv.Value;
      setLatestValues(map);
    }).catch(() => {}).finally(() => setTableLoading(false));
  }, [area]);

  useEffect(() => {
    const tags = pickChartTags(profiles);
    if (!tags.length) { setTrendPoints([]); return; }
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    setTrendLoading(true);
    api.trends(tags.map(t => t.Tag), isoNDaysAgo(days), isoToday())
      .then(setTrendPoints).catch(() => setTrendPoints([])).finally(() => setTrendLoading(false));
  }, [profiles, dateRange]);

  const chartTags = pickChartTags(profiles);
  const grouped   = groupByTag(trendPoints);

  // Plan range from lo/hi — "lo - hi" or "NA"
  function planLabel(p: TagProfile): string {
    if (p.LowerLimit != null && p.UpperLimit != null) return `${p.LowerLimit} - ${p.UpperLimit}`;
    if (p.LowerLimit != null) return `≥ ${p.LowerLimit}`;
    if (p.UpperLimit != null) return `≤ ${p.UpperLimit}`;
    return "NA";
  }

  // Determine if actual value is within limits
  function actualColor(val: number | null | undefined, p: TagProfile): string {
    if (val == null) return C.MUTED;
    if (p.LowerLimit != null && val < p.LowerLimit) return C.ALARM;
    if (p.UpperLimit != null && val > p.UpperLimit) return C.ALARM;
    return C.OK;
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Weekly KPI table */}
      <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.BORDER}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: C.TEXT }}>KPI Weekly</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.72rem", color: C.MUTED }}>Time Period</span>
            <select
              value={timePeriod}
              onChange={e => setTimePeriod(e.target.value as typeof timePeriod)}
              style={{
                background: C.CARD2, border: `1px solid ${C.BORDER}`,
                color: C.ACCENT, borderRadius: 4,
                padding: "2px 8px", fontSize: "0.72rem",
                cursor: "pointer",
              }}
            >
              {TIME_PERIODS.map(p => (
                <option key={p.label} value={p.label}>{p.label}</option>
              ))}
            </select>
          </div>
          <span style={{ fontSize: "0.7rem", color: C.MUTED, marginLeft: "auto" }}>{weekLabel}</span>
        </div>
        {tableLoading ? (
          <div style={{ padding: 16, color: C.MUTED, fontSize: "0.82rem" }}>Loading…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ background: C.CARD2, borderBottom: `1px solid ${C.BORDER}` }}>
                  {["Week", "Tag", "Description", "Plan", "Actual (Weekly)", "Unit"].map(h => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: C.MUTED, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.filter(p => !p.IsCalculated).map((p, i) => {
                  const val = latestValues[p.Tag];
                  const valStr = val != null ? Number(val.toFixed(1)).toString() : "null";
                  const color  = actualColor(val, p);
                  return (
                    <tr key={p.Tag} style={{ borderBottom: `1px solid ${C.BORDER}22`, background: i % 2 === 0 ? "transparent" : C.CARD2 + "55" }}>
                      <td style={{ padding: "7px 14px", color: C.MUTED, whiteSpace: "nowrap" }}>{weekLabel}</td>
                      <td style={{ padding: "7px 14px", color: C.TEXT, fontFamily: "monospace", fontSize: "0.72rem" }}>{p.Tag}</td>
                      <td style={{ padding: "7px 14px", color: C.ACCENT }}>{p.Description}</td>
                      <td style={{ padding: "7px 14px", color: C.TEXT }}>{planLabel(p)}</td>
                      <td style={{ padding: "7px 14px", fontWeight: 600, color }}>{valStr}</td>
                      <td style={{ padding: "7px 14px", color: C.MUTED }}>{p.Unit || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trend charts */}
      <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.TEXT }}>Sensor Trends</span>
            <span style={{ fontSize: "0.72rem", color: C.MUTED, marginLeft: 10 }}>{area} · top sensors</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["7d", "30d", "90d"] as const).map(r => (
              <button key={r} onClick={() => setDateRange(r)} style={{
                padding: "3px 10px", fontSize: "0.72rem", borderRadius: 4, cursor: "pointer",
                border: `1px solid ${dateRange === r ? C.ACCENT : C.BORDER}`,
                background: dateRange === r ? C.ACCENT : C.CARD2,
                color: dateRange === r ? "#fff" : C.MUTED, fontWeight: dateRange === r ? 700 : 400,
              }}>
                {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "90 days"}
              </button>
            ))}
          </div>
        </div>
        {trendLoading ? (
          <div style={{ color: C.MUTED, fontSize: "0.82rem", padding: "20px 0", textAlign: "center" }}>Loading…</div>
        ) : chartTags.length === 0 ? (
          <div style={{ color: C.MUTED, fontSize: "0.82rem", padding: "20px 0", textAlign: "center" }}>No sensor data for {area}.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
            {chartTags.map((profile, idx) => {
              const pts = grouped[profile.Tag] ?? [];
              const color = CHART_COLORS[idx % CHART_COLORS.length];
              return (
                <div key={profile.Tag} style={{ background: C.CARD2, border: `1px solid ${C.BORDER}`, borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: C.TEXT, marginBottom: 2 }}>{profile.Description}</div>
                  <div style={{ fontSize: "0.65rem", color: C.MUTED, marginBottom: 6 }}>{profile.Unit || ""}</div>
                  {pts.length === 0 ? (
                    <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: C.MUTED, fontSize: "0.75rem" }}>No data</div>
                  ) : (
                    <Plot
                      data={[{ type: "scatter", mode: "lines", x: pts.map(p => p.Timestamp_AZ), y: pts.map(p => p.Value), line: { color, width: 1.5 }, hovertemplate: `<b>%{y:.2f}</b> ${profile.Unit || ""}<extra>${profile.Description}</extra>` } as Plotly.Data]}
                      layout={{ height: 130, paper_bgcolor: "transparent", plot_bgcolor: "transparent", margin: { l: 44, r: 8, t: 4, b: 28 }, xaxis: { type: "date", gridcolor: C.BORDER, color: C.MUTED, tickfont: { size: 9, color: C.MUTED } }, yaxis: { gridcolor: C.BORDER, color: C.MUTED, tickfont: { size: 9, color: C.MUTED } }, showlegend: false, font: { color: C.TEXT } } as Partial<Plotly.Layout>}
                      config={{ displayModeBar: false, responsive: true }}
                      useResizeHandler style={{ width: "100%" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── KPI Detailed view ─────────────────────────────────────────────────────────

function KpiDetailedView({ area }: { area: string }) {
  const { C } = useTheme();
  const [profiles,     setProfiles]     = useState<TagProfile[]>([]);
  const [trendPoints,  setTrendPoints]  = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    api.areaProfiles(area).then(setProfiles).catch(() => setProfiles([]));
  }, [area]);

  useEffect(() => {
    const tags = pickChartTags(profiles);
    if (!tags.length) { setTrendPoints([]); return; }
    setTrendLoading(true);
    api.trends(tags.map(t => t.Tag), isoNDaysAgo(90), isoToday())
      .then(setTrendPoints).catch(() => setTrendPoints([])).finally(() => setTrendLoading(false));
  }, [profiles]);

  const chartTags = pickChartTags(profiles);
  const grouped   = groupByTag(trendPoints);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: "0.72rem", color: C.MUTED, marginBottom: 16 }}>
        Weekly averages over the last 90 days · {area}
      </div>

      {trendLoading ? (
        <div style={{ color: C.MUTED }}>Loading…</div>
      ) : chartTags.length === 0 ? (
        <div style={{ color: C.MUTED }}>No sensor data for {area}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {chartTags.map((profile, idx) => {
            const pts   = grouped[profile.Tag] ?? [];
            const weeks = weeklyBuckets(pts);
            const color = CHART_COLORS[idx % CHART_COLORS.length];
            // Simulated "plan" line at +10% above avg
            const avgVal = weeks.length ? weeks.reduce((s, w) => s + w.avg, 0) / weeks.length : 0;
            const planLine = weeks.map(() => avgVal * 1.1);

            return (
              <div key={profile.Tag} style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.TEXT, marginBottom: 2 }}>{profile.Description}</div>
                <div style={{ fontSize: "0.7rem", color: C.MUTED, marginBottom: 12 }}>Weekly avg · {profile.Unit || "—"}</div>

                {weeks.length === 0 ? (
                  <div style={{ color: C.MUTED, fontSize: "0.8rem" }}>No data</div>
                ) : (
                  <>
                    <Plot
                      data={[
                        {
                          type: "bar", name: "Actual",
                          x: weeks.map(w => w.week), y: weeks.map(w => w.avg),
                          marker: { color },
                          hovertemplate: `<b>%{y:.2f}</b> ${profile.Unit || ""}<extra>Actual</extra>`,
                        } as Plotly.Data,
                        {
                          type: "scatter", mode: "lines", name: "Plan",
                          x: weeks.map(w => w.week), y: planLine,
                          line: { color: C.ALARM, width: 2, dash: "dot" },
                          hovertemplate: `<b>%{y:.2f}</b> ${profile.Unit || ""}<extra>Plan</extra>`,
                        } as Plotly.Data,
                      ]}
                      layout={{
                        height: 200,
                        paper_bgcolor: "transparent", plot_bgcolor: "transparent",
                        margin: { l: 50, r: 16, t: 8, b: 40 },
                        xaxis: { type: "date", gridcolor: C.BORDER, color: C.MUTED, tickfont: { size: 10, color: C.MUTED } },
                        yaxis: { gridcolor: C.BORDER, color: C.MUTED, tickfont: { size: 10, color: C.MUTED }, title: { text: profile.Unit || "", font: { color: C.MUTED, size: 10 } } },
                        legend: { font: { color: C.MUTED, size: 10 }, bgcolor: "transparent" },
                        font: { color: C.TEXT },
                        barmode: "overlay",
                      } as Partial<Plotly.Layout>}
                      config={{ displayModeBar: false, responsive: true }}
                      useResizeHandler style={{ width: "100%" }}
                    />

                    {/* Summary table */}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", marginTop: 10 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.BORDER}` }}>
                          {["Week", "Avg Actual", "Plan", "vs Plan"].map(h => (
                            <th key={h} style={{ padding: "4px 8px", textAlign: h === "Week" ? "left" : "right", color: C.MUTED, fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {weeks.slice(-8).map((w, i) => {
                          const plan = planLine[i] ?? avgVal * 1.1;
                          const diff = ((w.avg - plan) / plan) * 100;
                          return (
                            <tr key={w.week} style={{ borderBottom: `1px solid ${C.BORDER}22` }}>
                              <td style={{ padding: "4px 8px", color: C.TEXT }}>{w.week}</td>
                              <td style={{ padding: "4px 8px", textAlign: "right", color: C.TEXT, fontWeight: 600 }}>{w.avg.toFixed(2)}</td>
                              <td style={{ padding: "4px 8px", textAlign: "right", color: C.MUTED }}>{plan.toFixed(2)}</td>
                              <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, color: diff >= 0 ? C.OK : C.ALARM }}>
                                {diff >= 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main DashboardTab ──────────────────────────────────────────────────────────

export function DashboardTab() {
  const { C } = useTheme();
  const [view,   setView]   = useState<"weekly" | "detailed">("weekly");
  const [area,   setArea]   = useState(DASHBOARD_AREAS[0]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Top nav: KPI Weekly | KPI Detailed */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        background: C.CARD, borderBottom: `1px solid ${C.BORDER}`, flexShrink: 0, padding: "0 10px",
      }}>
        {([["weekly", "KPI Weekly"], ["detailed", "KPI Detailed"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "9px 14px", fontSize: "0.82rem",
            fontWeight: view === v ? 700 : 500,
            color: view === v ? C.TEXT : C.MUTED,
            borderBottom: `2px solid ${view === v ? C.ACCENT : "transparent"}`,
          }}>{label}</button>
        ))}
      </div>

      {/* Area sub-tabs */}
      <div style={{
        display: "flex", overflowX: "auto", flexShrink: 0,
        background: C.CARD2, borderBottom: `1px solid ${C.BORDER}`, scrollbarWidth: "none",
      }}>
        {DASHBOARD_AREAS.map(a => (
          <button key={a} onClick={() => setArea(a)} style={{
            background: "none", border: "none",
            borderBottom: area === a ? `2px solid ${C.ACCENT}` : "2px solid transparent",
            color: area === a ? C.ACCENT : C.MUTED,
            padding: "7px 14px", fontSize: "0.75rem",
            fontWeight: area === a ? 700 : 400,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {a}
          </button>
        ))}
      </div>

      {/* Content: view + comments panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {view === "weekly" ? <KpiWeeklyView area={area} /> : <KpiDetailedView area={area} />}
        </div>

        {/* Comments panel */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: `1px solid ${C.BORDER}`, background: C.CARD, overflow: "hidden" }}>
          <CommentsPanel area={area} tags={[area]} />
        </div>
      </div>
    </div>
  );
}
