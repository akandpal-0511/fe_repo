import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { fetchStackingAllocation, fetchOreFeedRate } from "../api";
import type { StackingRow, StackingMap, OreFeedPoint } from "../types";
import { getMaterialColors, MATERIAL_LEGEND } from "../constants";
import { useTheme } from "../theme";
import type { Colors } from "../theme";

// ── Pivot ──────────────────────────────────────────────────────────────────────

function cellOverallStatus(cellData: Record<number, StackingRow>): "Complete" | "In Progress" | "Not Started" {
  const statuses = Object.values(cellData).map(r => r.status);
  if (statuses.every(s => s === "Complete")) return "Complete";
  if (statuses.some(s => s === "In Progress")) return "In Progress";
  return "Not Started";
}

function cellStepRank(data: StackingMap, cells: string[]): Record<string, number> {
  const minOrders = cells.map(cell => {
    const rows = Object.values(data[cell] ?? {});
    const min = rows.length ? Math.min(...rows.map(r => r.stacking_order)) : Infinity;
    return { cell, min };
  });
  minOrders.sort((a, b) => a.min - b.min);
  const rank: Record<string, number> = {};
  minOrders.forEach(({ cell }, i) => { rank[cell] = i + 1; });
  return rank;
}

function pivot(rows: StackingRow[]): { map: StackingMap; panels: number[]; cells: string[] } {
  const map: StackingMap = {};
  const panelSet = new Set<number>();
  const cellSet = new Set<string>();
  for (const row of rows) {
    if (!map[row.cell]) map[row.cell] = {};
    map[row.cell][row.panel] = row;
    panelSet.add(Number(row.panel));
    cellSet.add(row.cell);
  }
  const panels = [...panelSet].sort((a, b) => b - a);
  const cells  = [...cellSet].sort();
  return { map, panels, cells };
}

// ── Renderers (take C so they react to theme changes) ─────────────────────────

function makeMetrics(C: Colors, theme: "dark" | "light") {
  // High-contrast semantic colors that work on both dark and coloured light-mode backgrounds
  const OK     = theme === "light" ? "#1a6e1a" : C.OK;
  const ALARM  = theme === "light" ? "#b32000" : C.ALARM;
  const ACCENT = theme === "light" ? "#1145a0" : C.ACCENT;
  const MUTED  = theme === "light" ? "#444444" : C.MUTED;
  const WARN   = theme === "light" ? "#8a5a00" : C.WARN;
  const barBg  = theme === "light" ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.15)";

  return [
    {
      label: "Planned Tons",
      render: (r: StackingRow) => <>{r.tons_planned == null ? "—" : r.tons_planned.toLocaleString()}</>,
    },
    {
      label: "Actual Tons",
      render: (r: StackingRow) => {
        if (r.status === "Not Started") return <span style={{ color: MUTED }}>—</span>;
        if (r.actual_tons == null) return <span style={{ color: MUTED }}>—</span>;
        const formatted = r.actual_tons.toLocaleString();
        if (r.tons_planned == null) return <>{formatted}</>;
        const delta = r.actual_tons - r.tons_planned;
        if (delta === 0) return <>{formatted}</>;
        const deltaColor = delta > 0 ? OK : ALARM;
        const deltaStr = delta > 0 ? `▲ ${delta.toLocaleString()}` : `▼ ${Math.abs(delta).toLocaleString()}`;
        return (
          <span>
            {formatted}{" "}
            <span style={{ color: deltaColor, fontSize: "0.72rem", fontWeight: 600 }}>{deltaStr}</span>
          </span>
        );
      },
    },
    {
      label: "Rate Plan (t/day)",
      render: (r: StackingRow) => {
        if (r.status === "Not Started") return <span style={{ color: MUTED }}>—</span>;
        if (r.tons_planned == null || r.days_stacked_planned == null || r.days_stacked_planned === 0) return <>—</>;
        return <>{Math.round(r.tons_planned / r.days_stacked_planned).toLocaleString()}</>;
      },
    },
    {
      label: "Rate Actual (t/day)",
      render: (r: StackingRow) => {
        if (r.status === "Not Started") return <span style={{ color: MUTED }}>—</span>;
        if (r.current_rate_tpd == null || r.current_rate_tpd === 0) return <span style={{ color: MUTED }}>—</span>;
        return <>{Math.round(r.current_rate_tpd).toLocaleString()}</>;
      },
    },
    {
      label: "Days Planned",
      render: (r: StackingRow) => <>{r.days_stacked_planned == null ? "—" : r.days_stacked_planned.toFixed(2)}</>,
    },
    {
      label: "Plan Start",
      render: (r: StackingRow) => r.status === "Not Started" ? <span style={{ color: MUTED }}>—</span> : <>{r.cell_start_date ?? "—"}</>,
    },
    {
      label: "Plan End",
      render: (r: StackingRow) => <>{r.cell_end_date ?? "—"}</>,
    },
    {
      label: "Actual Start",
      render: (r: StackingRow) => {
        if (!r.actual_start_ts) return <span style={{ color: MUTED }}>—</span>;
        return <>{r.actual_start_ts.slice(0, 16).replace("T", " ")}</>;
      },
    },
    {
      label: "Potential/Actual End",
      render: (r: StackingRow) => {
        if (r.status === "Not Started") return <span style={{ color: MUTED }}>—</span>;
        if (r.status === "Complete") {
          if (!r.actual_end_ts) return <span style={{ color: MUTED }}>—</span>;
          return <>{r.actual_end_ts.slice(0, 16).replace("T", " ")}</>;
        }
        // In Progress: project end = planned end + delay offset
        const dateStr = (() => {
          if (!r.cell_end_date || r.delay_days == null) return r.cell_end_date ?? null;
          const d = new Date(r.cell_end_date);
          d.setDate(d.getDate() + Math.round(r.delay_days));
          return d.toISOString().slice(0, 10);
        })();
        if (!dateStr) return <span style={{ color: MUTED }}>—</span>;
        if (r.delay_days == null) return <>{dateStr}</>;
        const delay = Math.round(r.delay_days);
        const schedBg = delay === 0 ? OK : delay > 0 ? ALARM : OK;
        const schedLabel = delay === 0 ? "On Time" : delay > 0 ? `+${delay}d behind` : `${Math.abs(delay)}d ahead`;
        return (
          <span>
            {dateStr}{" "}
            <span style={{ background: schedBg, color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 600, fontSize: "0.68rem", whiteSpace: "nowrap" }}>
              {schedLabel}
            </span>
          </span>
        );
      },
    },
    {
      label: "Status",
      render: (r: StackingRow) => {
        const badgeBg = r.status === "Complete" ? OK : r.status === "In Progress" ? ACCENT : (theme === "light" ? "#888" : MUTED);
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: badgeBg, color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700, fontSize: "0.68rem", whiteSpace: "nowrap" }}>
              {r.status}
            </span>
          </span>
        );
      },
    },
    {
      label: "% Complete",
      render: (r: StackingRow) => {
        if (r.pct_complete == null) return <span style={{ color: MUTED }}>—</span>;
        const pct = Math.min(100, Math.max(0, r.pct_complete));
        const barColor = pct >= 100 ? OK : pct >= 50 ? ACCENT : WARN;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
            <div style={{ width: 48, height: 5, background: barBg, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
            </div>
            <span>{r.pct_complete.toFixed(1)}%</span>
          </div>
        );
      },
    },
  ];
}

// ── Cell styling ───────────────────────────────────────────────────────────────

function cellStyle(row: StackingRow | undefined, C: Colors, theme: "dark" | "light", isFirstRow: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    textAlign: "right",
    padding: "3px 8px",
    fontSize: "0.71rem",
    borderTop: isFirstRow ? `1px solid ${C.BORDER}` : "none",
    borderLeft: `1px solid ${C.BORDER}`,
    borderRight: `1px solid ${C.BORDER}`,
    borderBottom: "none",
    whiteSpace: "nowrap",
  };
  if (!row) return { ...base, background: C.CARD2, color: C.MUTED };
  const palette = getMaterialColors(theme);
  const mc = palette[row.material] ?? { bg: C.CARD2, text: C.TEXT };
  return { ...base, background: mc.bg, color: mc.text };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function StackingTab({ refreshKey: externalRefreshKey = 0, onDataLoaded }: { refreshKey?: number; onDataLoaded?: (d: Date) => void }) {
  const { C, theme }          = useTheme();
  const [data, setData]           = useState<StackingMap>({});
  const [panels, setPanels]       = useState<number[]>([]);
  const [cells, setCells]         = useState<string[]>([]);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [feedRate, setFeedRate]         = useState<OreFeedPoint[]>([]);
  const [feedLoading, setFeedLoading]   = useState(true);
  const [timeFilter, setTimeFilter]     = useState<string>("24H");
  const [chartOpen, setChartOpen]       = useState(true);
  const [dailyOpen, setDailyOpen]       = useState(true);
  const [dailyMode, setDailyMode]       = useState<"calendar" | "shift">("calendar");

  useEffect(() => {
    setFeedLoading(true);
    fetchOreFeedRate().then(setFeedRate).catch(() => setFeedRate([])).finally(() => setFeedLoading(false));
  }, [externalRefreshKey]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchStackingAllocation()
      .then((rows: StackingRow[]) => { const { map, panels, cells } = pivot(rows); setData(map); setPanels(panels); setCells(cells); onDataLoaded?.(new Date()); })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [externalRefreshKey]);

  const METRICS  = makeMetrics(C, theme);
  const stepRank = cellStepRank(data, cells);

  if (loading) return <div style={{ color: C.MUTED, padding: 24 }}>Loading…</div>;
  if (error)   return <div style={{ color: C.ALARM, padding: 24 }}>Error: {error}</div>;

  const th: React.CSSProperties = {
    background: C.CARD2,
    color: C.TEXT,
    padding: "4px 8px",
    fontSize: "0.71rem",
    fontWeight: 600,
    border: `1px solid ${C.BORDER}`,
    whiteSpace: "nowrap",
    textAlign: "center",
  };

  const STATUS_COLOR: Record<string, string> = {
    "Complete":    C.OK,
    "In Progress": C.ACCENT,
    "Not Started": C.WARN,
  };

  return (
    <div style={{ padding: "4px 0" }}>
      <style>{`
        @keyframes cell-pulse { 0%,100%{filter:brightness(1)} 50%{filter:brightness(2.2)} }
        @keyframes cell-pulse-dim { 0%,100%{filter:brightness(1)} 50%{filter:brightness(0.78)} }
      `}</style>


      {/* Ore Feed Rate chart (collapsible) */}
      <div style={{ marginBottom: 14, border: `1px solid ${C.BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <button
          onClick={() => setChartOpen(o => !o)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            background: C.CARD2, border: "none", padding: "8px 14px", cursor: "pointer",
            color: C.TEXT, fontSize: "0.78rem", fontWeight: 600,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>Ore Feed Rate &amp; Interval Tons</span>
            <span style={{ fontSize: "0.7rem", color: C.ACCENT, fontWeight: 400 }}>{chartOpen ? "▲ click to hide" : "▼ click to expand"}</span>
          </span>
        </button>
        {chartOpen && (() => {
        const FILTER_OPTIONS = [
          { key: "30M",             label: "Last 30 minutes" },
          { key: "1H",              label: "Last hour" },
          { key: "6H",              label: "Last 6 hours" },
          { key: "12H",             label: "Last 12 hours" },
          { key: "24H",             label: "Last 24 hours" },
          { key: "TODAY",           label: "Today" },
          { key: "YESTERDAY",       label: "Yesterday" },
          { key: "SINCE_YESTERDAY", label: "Since yesterday" },
          { key: "7D",              label: "Last 7 days" },
          { key: "14D",             label: "Last 14 days" },
          { key: "30D",             label: "Last 30 days" },
          { key: "ALL",             label: "All" },
        ];
        const filtered = (() => {
          if (feedRate.length === 0) return [];
          const latest = new Date(feedRate[feedRate.length - 1].ts).getTime();
          const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
          const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
          const byHours = (h: number) => {
            const cutoff = latest - h * 3_600_000;
            return feedRate.filter(p => new Date(p.ts).getTime() >= cutoff);
          };
          switch (timeFilter) {
            case "30M":             return byHours(0.5);
            case "1H":              return byHours(1);
            case "6H":              return byHours(6);
            case "12H":             return byHours(12);
            case "24H":             return byHours(24);
            case "TODAY":           return feedRate.filter(p => new Date(p.ts) >= startOfToday);
            case "YESTERDAY":       return feedRate.filter(p => new Date(p.ts) >= startOfYesterday && new Date(p.ts) < startOfToday);
            case "SINCE_YESTERDAY": return feedRate.filter(p => new Date(p.ts) >= startOfYesterday);
            case "7D":              return byHours(168);
            case "14D":             return byHours(336);
            case "30D":             return byHours(720);
            case "ALL":             return feedRate;
            default:                return feedRate;
          }
        })();
        const filteredCV = filtered.filter(p => p.tag === "_155CV218_TonHr");
        const filteredBS = filtered.filter(p => p.tag === "_155BS206_TonHr");
        // If neither tag is present (old server without tag column), fall back to all data as single trace
        const hasTagData  = filteredCV.length > 0 || filteredBS.length > 0;
        const cvData      = hasTagData ? filteredCV : filtered;
        const bsData      = hasTagData ? filteredBS : [];
        const chartAxisStyle = {
          color: C.MUTED,
          gridcolor: C.BORDER,
          tickfont: { size: 8, color: C.MUTED },
          type: "date" as const,
        };
        return (
          <div style={{ background: C.BG, padding: "8px 14px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <select
                value={timeFilter}
                onChange={e => setTimeFilter(e.target.value)}
                style={{
                  fontSize: "0.72rem",
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: `1px solid ${C.ACCENT}`,
                  background: C.CARD2,
                  color: C.TEXT,
                  cursor: "pointer",
                }}
              >
                {FILTER_OPTIONS.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
            {feedLoading ? (
              <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: C.MUTED, fontSize: "0.78rem" }}>
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: C.MUTED, fontSize: "0.78rem" }}>
                No data for selected time range
              </div>
            ) : (
              <Plot
                data={[
                  {
                    type: "scatter", mode: "lines",
                    x: cvData.map(p => p.ts),
                    y: cvData.map(p => p.rate_thr),
                    yaxis: "y",
                    name: "Ore Discharge Rate from Agglomerator",
                    line: { color: C.ACCENT, width: 1.5 },
                    hovertemplate: "<b>%{y:.1f} t/hr</b><extra>Discharge</extra>",
                  } as Plotly.Data,
                  ...(bsData.length > 0 ? [{
                    type: "scatter", mode: "lines",
                    x: bsData.map(p => p.ts),
                    y: bsData.map(p => p.rate_thr),
                    yaxis: "y",
                    name: "Ore Feed Rate to Agglomerator",
                    line: { color: "#4caf76", width: 1.5 },
                    hovertemplate: "<b>%{y:.1f} t/hr</b><extra>Feed</extra>",
                  } as Plotly.Data] : []),
                ]}
                layout={{
                  height: 160,
                  paper_bgcolor: "transparent", plot_bgcolor: "transparent",
                  margin: { l: 44, r: 12, t: 24, b: 32 },
                  xaxis: chartAxisStyle,
                  yaxis: {
                    ...chartAxisStyle, type: undefined,
                    title: { text: "t/hr", font: { color: C.MUTED, size: 8 } },
                    rangemode: "tozero", tickfont: { size: 8, color: C.MUTED },
                  },
                  showlegend: true,
                  legend: { orientation: "h", x: 0, y: 1.18, font: { size: 9, color: C.TEXT } },
                  font: { color: C.TEXT },
                  hovermode: "x unified",
                  hoverlabel: {
                    bgcolor: theme === "dark" ? "#1a2235" : "#ffffff",
                    bordercolor: C.BORDER,
                    font: { color: C.TEXT, size: 11 },
                  },
                } as Partial<Plotly.Layout>}
                config={{ displayModeBar: false, responsive: true }}
                useResizeHandler
                style={{ width: "100%" }}
              />
            )}
          </div>
        );
      })()}
      </div>

      {/* Daily Tonnage Summary */}
      {feedRate.length > 0 && (() => {
        const chainStart = Object.values(data)
          .flatMap(panelMap => Object.values(panelMap))
          .filter(r => r.actual_start_ts !== null)
          .map(r => r.cell_start_date)
          .filter(Boolean)
          .sort()[0] ?? null;
        const chainFeed = chainStart
          ? feedRate.filter(p => p.ts.slice(0, 10) >= chainStart)
          : feedRate;

        const buildDaily = (tag: string) => {
          const m: Record<string, number> = {};
          chainFeed.filter(p => p.tag === tag || (!p.tag && tag === "_155CV218_TonHr")).forEach(p => {
            let date: string;
            if (dailyMode === "shift") {
              const hour = parseInt(p.ts.slice(11, 13), 10);
              if (hour < 5) {
                const [y, m, d] = p.ts.slice(0, 10).split("-").map(Number);
                const prev = new Date(Date.UTC(y, m - 1, d - 1));
                date = prev.toISOString().slice(0, 10);
              } else {
                date = p.ts.slice(0, 10);
              }
            } else {
              date = p.ts.slice(0, 10);
            }
            m[date] = (m[date] ?? 0) + (p.tons_interval ?? 0);
          });
          return m;
        };
        const dailyCV = buildDaily("_155CV218_TonHr");
        const dailyBS = buildDaily("_155BS206_TonHr");
        const daysCV  = Object.keys(dailyCV).sort();
        const daysBS  = Object.keys(dailyBS).sort();
        const allDays = [...new Set([...daysCV, ...daysBS])].sort();
        if (allDays.length === 0) return null;

        const totalCV = daysCV.reduce((s, d) => s + Math.round(dailyCV[d]), 0);
        const totalBS = daysBS.reduce((s, d) => s + Math.round(dailyBS[d]), 0);

        return (
          <div style={{ marginBottom: 14, border: `1px solid ${C.BORDER}`, borderRadius: 8, overflow: "hidden" }}>
            <button
              onClick={() => setDailyOpen(o => !o)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                background: C.CARD2, border: "none", padding: "8px 14px", cursor: "pointer",
                color: C.TEXT, fontSize: "0.78rem", fontWeight: 600,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span>Daily Tons Stacked</span>
                <span style={{ fontSize: "0.7rem", color: C.ACCENT, fontWeight: 400 }}>{dailyOpen ? "▲ click to hide" : "▼ click to expand"}</span>
              </span>
            </button>
            {dailyOpen && (
              <div style={{ background: C.BG, padding: "8px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 0 }}>
                    {(["calendar", "shift"] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setDailyMode(mode)}
                        style={{
                          padding: "4px 14px",
                          fontSize: "0.72rem",
                          fontWeight: dailyMode === mode ? 600 : 400,
                          border: `1px solid ${C.ACCENT}`,
                          background: dailyMode === mode ? C.ACCENT : "transparent",
                          color: dailyMode === mode ? "#fff" : C.TEXT,
                          cursor: "pointer",
                          borderRadius: mode === "calendar" ? "4px 0 0 4px" : "0 4px 4px 0",
                        }}
                      >
                        {mode === "calendar" ? "Calendar Day" : "Shift Day"}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: C.TEXT }}>
                    {dailyMode === "calendar" ? "Midnight to Midnight" : "e.g. Jun 18 = 5 AM Jun 18 to 5 AM Jun 19"}
                  </span>
                </div>
                <Plot
                  data={[
                    ...(daysCV.length > 0 ? [{
                      type: "bar" as const,
                      x: allDays,
                      y: allDays.map(d => dailyCV[d] != null ? Math.round(dailyCV[d]) : null),
                      name: "Ore Discharge",
                      marker: { color: C.ACCENT },
                      text: allDays.map(d => dailyCV[d] != null ? Math.round(dailyCV[d]).toLocaleString() : ""),
                      textposition: "inside" as const,
                      insidetextanchor: "middle" as const,
                      textfont: { size: 8, color: "#ffffff" },
                      hovertemplate: "<b>%{y:,} t</b><extra>Discharge</extra>",
                    }] : []),
                    ...(daysBS.length > 0 ? [{
                      type: "bar" as const,
                      x: allDays,
                      y: allDays.map(d => dailyBS[d] != null ? Math.round(dailyBS[d]) : null),
                      name: "Ore Feed",
                      marker: { color: "#4caf76" },
                      text: allDays.map(d => dailyBS[d] != null ? Math.round(dailyBS[d]).toLocaleString() : ""),
                      textposition: "inside" as const,
                      insidetextanchor: "middle" as const,
                      textfont: { size: 8, color: "#ffffff" },
                      hovertemplate: "<b>%{y:,} t</b><extra>Feed</extra>",
                    }] : []),
                  ]}
                  layout={{
                    paper_bgcolor: C.BG, plot_bgcolor: C.BG,
                    font: { color: C.MUTED, size: 9 },
                    margin: { t: 40, r: 8, b: 40, l: 48 },
                    barmode: "group",
                    bargap: 0.25,
                    bargroupgap: 0.08,
                    height: 230,
                    showlegend: true,
                    legend: { orientation: "h", x: 0, y: 1.14, font: { size: 9, color: C.TEXT } },
                    xaxis: { color: C.MUTED, gridcolor: C.BORDER, tickfont: { size: 8 }, type: "category" as const },
                    yaxis: { color: C.MUTED, gridcolor: C.BORDER, tickfont: { size: 8 }, title: { text: "tons", font: { size: 8, color: C.MUTED } } },
                    annotations: [{
                      xref: "paper", yref: "paper", x: 1, y: 1.14,
                      xanchor: "right", yanchor: "bottom",
                      text: [
                        daysCV.length > 0 ? `Discharge: <b>${totalCV.toLocaleString()} t</b>` : "",
                        daysBS.length > 0 ? `Feed: <b>${totalBS.toLocaleString()} t</b>` : "",
                      ].filter(Boolean).join("  |  "),
                      showarrow: false, font: { size: 9, color: C.TEXT },
                    }],
                  } as Partial<Plotly.Layout>}
                  config={{ displayModeBar: false, responsive: true }}
                  useResizeHandler
                  style={{ width: "100%" }}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "10px 0 8px", paddingLeft: 4 }}>
        {MATERIAL_LEGEND.map(m => (
          <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: 2, background: m.color, flexShrink: 0 }} />
            <span style={{ fontSize: "0.75rem", color: C.MUTED }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 48, position: "sticky", left: 0, zIndex: 3 }}></th>
              <th style={{ ...th, textAlign: "left", position: "sticky", left: 48, zIndex: 3 }}>Metric</th>
              {panels.map(p => (
                <th key={p} style={{
                  ...th,
                  color: p === 1 ? C.ACCENT : C.TEXT,
                  background: p === 1 ? C.CARD : C.CARD2,
                }}>
                  {`Panel ${p}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.flatMap((cell, ci) => {
              const cellData = data[cell] ?? {};
              const overallStatus = cellOverallStatus(cellData);
              const statusColor = STATUS_COLOR[overallStatus] ?? C.MUTED;
              const step = stepRank[cell] ?? ci + 1;

              const metricRows = METRICS.map((metric, mi) => (
                <tr key={`${cell}-${mi}`}>
                  {mi === 0 && (
                    <td
                      rowSpan={METRICS.length}
                      style={{
                        background: C.CARD,
                        color: C.ACCENT,
                        fontWeight: 700,
                        textAlign: "center",
                        fontSize: "0.85rem",
                        borderLeft: `3px solid ${statusColor}`,
                        borderRight: `1px solid ${C.BORDER}`,
                        borderBottom: "none",
                        borderTop: `1px solid ${C.BORDER}`,
                        verticalAlign: "middle",
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                      }}
                    >
                      <div>{cell}</div>
                    </td>
                  )}

                  <td style={{
                    background: C.CARD,
                    color: C.TEXT,
                    padding: "3px 8px",
                    fontSize: "0.7rem",
                    borderTop: mi === 0 ? `1px solid ${C.BORDER}` : "none",
                    borderLeft: `1px solid ${C.BORDER}`,
                    borderRight: `1px solid ${C.BORDER}`,
                    borderBottom: "none",
                    whiteSpace: "nowrap",
                    position: "sticky",
                    left: 48,
                    zIndex: 2,
                  }}>
                    {metric.label}
                  </td>

                  {panels.map(panel => {
                    const row = data[cell]?.[panel];
                    return (
                      <td
                        key={panel}
                        style={{ ...cellStyle(row, C, theme, mi === 0), ...(row?.status === "In Progress" ? { animation: `${theme === "light" && row.material === "Core" ? "cell-pulse-dim" : "cell-pulse"} 1.8s ease-in-out infinite` } : {}) }}
                      >
                        {row ? metric.render(row) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ));

              return metricRows;
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
