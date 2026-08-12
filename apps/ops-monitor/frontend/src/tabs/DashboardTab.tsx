import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { useTheme } from "../theme";
import { api } from "../api";
import { CommentsPanel } from "../components/CommentsPanel";
import { PA_ORDER, paLabel } from "../constants";
import type { TagProfile, TrendPoint } from "../types";

const DASHBOARD_AREAS = [...PA_ORDER];

function isoNDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}
function isoToday() { return new Date().toISOString().slice(0, 10); }
function isoHoursAgo(n: number) {
  const d = new Date(); d.setHours(d.getHours() - n); return d.toISOString().slice(0, 19);
}
function isoNow() { return new Date().toISOString().slice(0, 19); }

function pickChartTags(profiles: TagProfile[]): TagProfile[] {
  return profiles.filter(p => !p.IsCalculated && p.DataSource?.toLowerCase().includes("historian")).slice(0, 4);
}

function groupByTag(points: TrendPoint[]): Record<string, TrendPoint[]> {
  const out: Record<string, TrendPoint[]> = {};
  for (const p of points) { if (!out[p.Tag]) out[p.Tag] = []; out[p.Tag].push(p); }
  return out;
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
            <span style={{ fontSize: "0.72rem", color: C.MUTED, marginLeft: 10 }}>{paLabel(area)} · top sensors</span>
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
          <div style={{ color: C.MUTED, fontSize: "0.82rem", padding: "20px 0", textAlign: "center" }}>No sensor data for {paLabel(area)}.</div>
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

const DETAIL_WINDOWS = [
  { label: "6 h",  hours: 6 },
  { label: "12 h", hours: 12 },
  { label: "24 h", hours: 24 },
] as const;

function KpiDetailedView({ area }: { area: string }) {
  const { C } = useTheme();
  const [profiles,     setProfiles]     = useState<TagProfile[]>([]);
  const [trendPoints,  setTrendPoints]  = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [hours,        setHours]        = useState<number>(24);

  useEffect(() => {
    api.areaProfiles(area).then(setProfiles).catch(() => setProfiles([]));
  }, [area]);

  useEffect(() => {
    const tags = pickChartTags(profiles);
    if (!tags.length) { setTrendPoints([]); return; }
    setTrendLoading(true);
    api.trends(tags.map(t => t.Tag), isoHoursAgo(hours), isoNow())
      .then(setTrendPoints).catch(() => setTrendPoints([])).finally(() => setTrendLoading(false));
  }, [profiles, hours]);

  const chartTags = pickChartTags(profiles);
  const grouped   = groupByTag(trendPoints);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: "0.72rem", color: C.MUTED }}>
          5 minute interval readings · last {hours} hours · {paLabel(area)}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {DETAIL_WINDOWS.map(w => (
            <button key={w.hours} onClick={() => setHours(w.hours)} style={{
              padding: "3px 10px", fontSize: "0.72rem", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${hours === w.hours ? C.ACCENT : C.BORDER}`,
              background: hours === w.hours ? C.ACCENT : C.CARD2,
              color: hours === w.hours ? "#fff" : C.MUTED, fontWeight: hours === w.hours ? 700 : 400,
            }}>{w.label}</button>
          ))}
        </div>
      </div>

      {trendLoading ? (
        <div style={{ color: C.MUTED }}>Loading…</div>
      ) : chartTags.length === 0 ? (
        <div style={{ color: C.MUTED }}>No sensor data for {paLabel(area)}.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {chartTags.map((profile, idx) => {
            const pts   = grouped[profile.Tag] ?? [];
            const color = CHART_COLORS[idx % CHART_COLORS.length];
            const vals  = pts.map(p => p.Value).filter((v): v is number => v != null);
            const latest = vals.length ? vals[vals.length - 1] : null;
            const avg    = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
            const min    = vals.length ? Math.min(...vals) : null;
            const max    = vals.length ? Math.max(...vals) : null;
            const x0 = pts[0]?.Timestamp_AZ, x1 = pts[pts.length - 1]?.Timestamp_AZ;

            // Actual line + operating-limit band from the tag's real Lower/Upper limits.
            const traces: Plotly.Data[] = [
              {
                type: "scatter", mode: "lines", name: "Actual",
                x: pts.map(p => p.Timestamp_AZ), y: pts.map(p => p.Value),
                line: { color, width: 1.2 },
                hovertemplate: `<b>%{y:.2f}</b> ${profile.Unit || ""}<br>%{x}<extra>Actual</extra>`,
              } as Plotly.Data,
            ];
            if (profile.LowerLimit != null) traces.push({
              type: "scatter", mode: "lines", name: "Lower limit",
              x: [x0, x1], y: [profile.LowerLimit, profile.LowerLimit],
              line: { color: C.ALARM, width: 1, dash: "dot" }, hoverinfo: "skip",
            } as Plotly.Data);
            if (profile.UpperLimit != null) traces.push({
              type: "scatter", mode: "lines", name: "Upper limit",
              x: [x0, x1], y: [profile.UpperLimit, profile.UpperLimit],
              line: { color: C.ALARM, width: 1, dash: "dot" }, hoverinfo: "skip",
            } as Plotly.Data);

            const stat = (label: string, v: number | null) => (
              <span>{label} <b style={{ color: C.TEXT }}>{v != null ? v.toFixed(1) : "—"}</b></span>
            );

            return (
              <div key={profile.Tag} style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.TEXT }}>{profile.Description}</div>
                    <div style={{ fontSize: "0.7rem", color: C.MUTED, marginTop: 2, fontFamily: "monospace" }}>{profile.Tag} · {profile.Unit || "—"}</div>
                  </div>
                  <div style={{ fontSize: "0.7rem", color: C.MUTED, display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {stat("Latest", latest)}{stat("Avg", avg)}{stat("Min", min)}{stat("Max", max)}
                    <span>{pts.length} pts</span>
                  </div>
                </div>

                {pts.length === 0 ? (
                  <div style={{ color: C.MUTED, fontSize: "0.8rem", marginTop: 10 }}>No data</div>
                ) : (
                  <Plot
                    data={traces}
                    layout={{
                      height: 220,
                      paper_bgcolor: "transparent", plot_bgcolor: "transparent",
                      margin: { l: 50, r: 16, t: 10, b: 40 },
                      xaxis: { type: "date", gridcolor: C.BORDER, color: C.MUTED, tickfont: { size: 10, color: C.MUTED } },
                      yaxis: { gridcolor: C.BORDER, color: C.MUTED, tickfont: { size: 10, color: C.MUTED }, title: { text: profile.Unit || "", font: { color: C.MUTED, size: 10 } } },
                      showlegend: false,
                      font: { color: C.TEXT },
                    } as Partial<Plotly.Layout>}
                    config={{ displayModeBar: false, responsive: true }}
                    useResizeHandler style={{ width: "100%", marginTop: 10 }}
                  />
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
            {paLabel(a)}
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
          <CommentsPanel area={area} tags={[paLabel(area)]} />
        </div>
      </div>
    </div>
  );
}
