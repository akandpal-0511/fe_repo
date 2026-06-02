import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { api } from "../api";
import type { StackingRow, StackingMap, OreFeedPoint } from "../types";
import { getMaterialColors, MATERIAL_LEGEND } from "../constants";
import { useTheme } from "../theme";
import type { Colors } from "../theme";
import { Heap3DPreview } from "../components/Heap3DPreview";

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

// ── Renderers ─────────────────────────────────────────────────────────────────

function makeMetrics(C: Colors) {
  return [
    {
      label: "Planned Tons",
      render: (r: StackingRow) => <>{r.tons_planned == null ? "—" : r.tons_planned.toLocaleString()}</>,
    },
    {
      label: "Actual Tons",
      render: (r: StackingRow) => {
        if (r.actual_tons == null) return <span style={{ color: C.MUTED }}>—</span>;
        const formatted = r.actual_tons.toLocaleString();
        if (r.tons_planned == null) return <>{formatted}</>;
        const delta = r.actual_tons - r.tons_planned;
        if (delta === 0) return <>{formatted}</>;
        const deltaColor = delta > 0 ? C.OK : C.ALARM;
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
      label: "Rate (t/day)",
      render: (r: StackingRow) => {
        if (r.tons_planned == null || r.days_stacked_planned == null || r.days_stacked_planned === 0) return <>—</>;
        return <>{Math.round(r.tons_planned / r.days_stacked_planned).toLocaleString()}</>;
      },
    },
    {
      label: "Days Planned",
      render: (r: StackingRow) => <>{r.days_stacked_planned == null ? "—" : r.days_stacked_planned.toFixed(2)}</>,
    },
    {
      label: "Start",
      render: (r: StackingRow) => <span style={{ opacity: 0.85 }}>{r.cell_start_date}</span>,
    },
    {
      label: "End",
      render: (r: StackingRow) => <span style={{ opacity: 0.85 }}>{r.cell_end_date}</span>,
    },
    {
      label: "Status",
      render: (r: StackingRow) => {
        const color = r.status === "Complete" ? C.OK : r.status === "In Progress" ? C.ACCENT : C.MUTED;
        return <span style={{ color, fontWeight: 600 }}>{r.status}</span>;
      },
    },
    {
      label: "% Complete",
      render: (r: StackingRow) => {
        if (r.pct_complete == null) return <span style={{ color: C.MUTED }}>—</span>;
        const pct = Math.min(100, Math.max(0, r.pct_complete));
        const barColor = pct >= 100 ? C.OK : pct >= 50 ? C.ACCENT : C.WARN;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
            <div style={{ width: 48, height: 5, background: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
            </div>
            <span>{r.pct_complete.toFixed(1)}%</span>
          </div>
        );
      },
    },
    {
      label: "Schedule",
      render: (r: StackingRow) => {
        if (r.delay_days == null) return <span style={{ color: C.MUTED }}>—</span>;
        const d = Math.round(r.delay_days);
        if (d === 0) return <span style={{ color: C.OK, fontWeight: 600 }}>On Time</span>;
        const color = d > 0 ? C.ALARM : C.OK;
        const label = d > 0 ? `+${d}d behind` : `${Math.abs(d)}d ahead`;
        return <span style={{ color, fontWeight: 600 }}>({label})</span>;
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
  if (row.status === "Not Started") return { ...base, background: "#fff3c4", color: "#111827", fontWeight: 600 };
  const palette = getMaterialColors(theme);
  const mc = palette[row.material] ?? { bg: C.CARD2, text: C.TEXT };
  return { ...base, background: mc.bg, color: mc.text };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function StackingTab({ refreshKey: externalRefreshKey = 0 }: { refreshKey?: number }) {
  const { C, theme }    = useTheme();
  const [mode, setMode] = useState<"prod" | "test">("prod");
  const [data, setData] = useState<StackingMap>({});
  const [panels, setPanels] = useState<number[]>([]);
  const [cells, setCells]   = useState<string[]>([]);
  const [error, setError]   = useState<string | null>(null);
  const [heapOpen, setHeapOpen] = useState(true);
  const [loading, setLoading]   = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tooltip, setTooltip] = useState<{ cell: string; panel: number; x: number; y: number } | null>(null);
  const [feedRate, setFeedRate] = useState<OreFeedPoint[]>([]);
  const [windowHours, setWindowHours] = useState<number>(168);

  useEffect(() => {
    api.oreFeedRate(7).then(setFeedRate).catch(() => setFeedRate([]));
  }, [externalRefreshKey]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.stackingAllocation(mode)
      .then(rows => {
        const { map, panels, cells } = pivot(rows);
        setData(map); setPanels(panels); setCells(cells);
        setLastUpdated(new Date());
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [mode, externalRefreshKey]);

  const METRICS  = makeMetrics(C);
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
    <div style={{ padding: "16px 0" }}>

      {/* Title + mode toggle */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: C.TEXT, margin: 0 }}>
            Heap Leach Panel Stacking Plan
          </h2>
          <div style={{ height: 2, width: 48, background: C.ACCENT, marginTop: 4, borderRadius: 2 }} />
          <div style={{ fontSize: "0.72rem", color: C.MUTED, marginTop: 6 }}>
            Stacking sequence: Panel 1 → 5 (right to left)&nbsp;&nbsp;↓&nbsp;&nbsp;Cells A → D (top to bottom)
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["prod", "test"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: "4px 14px",
                  borderRadius: 6,
                  border: `1px solid ${C.BORDER}`,
                  background: mode === m ? C.ACCENT : C.CARD2,
                  color: mode === m ? "#fff" : C.MUTED,
                  fontWeight: mode === m ? 700 : 400,
                  fontSize: "0.78rem",
                  cursor: "pointer",
                }}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          {lastUpdated && (
            <span style={{ fontSize: "0.68rem", color: C.MUTED }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14, paddingLeft: 4 }}>
        {MATERIAL_LEGEND.map(m => (
          <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: 2, background: m.color, flexShrink: 0 }} />
            <span style={{ fontSize: "0.75rem", color: C.MUTED }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* 3D Heap Preview + line charts (collapsible) */}
      <div style={{ marginBottom: 14, border: `1px solid ${C.BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <button
          onClick={() => setHeapOpen(o => !o)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            background: C.CARD2, border: "none", padding: "8px 14px", cursor: "pointer",
            color: C.TEXT, fontSize: "0.78rem", fontWeight: 600,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>3D Heap View &amp; Ore Feed</span>
            <span style={{ fontSize: "0.7rem", color: C.ACCENT, fontWeight: 400 }}>{heapOpen ? "▲ click to hide" : "▼ click to expand"}</span>
          </span>
        </button>
        {heapOpen && (() => {
          const WINDOW_OPTIONS = [
            { label: "1H",  hours: 1 },
            { label: "6H",  hours: 6 },
            { label: "24H", hours: 24 },
            { label: "3D",  hours: 72 },
            { label: "7D",  hours: 168 },
          ];

          const filtered = (() => {
            if (feedRate.length === 0) return [];
            const latest = new Date(feedRate[feedRate.length - 1].ts).getTime();
            const cutoff = latest - windowHours * 3_600_000;
            return feedRate.filter(p => new Date(p.ts).getTime() >= cutoff);
          })();

          const cumulative = filtered.reduce<{ ts: string; cum: number }[]>((acc, p, i) => {
            const prev = i > 0 ? acc[i - 1].cum : 0;
            acc.push({ ts: p.ts, cum: prev + (p.tons_interval ?? 0) });
            return acc;
          }, []);

          const chartLoading = (
            <div style={{ height: 142, display: "flex", alignItems: "center", justifyContent: "center", color: C.MUTED, fontSize: "0.78rem" }}>
              Loading…
            </div>
          );

          const chartAxisStyle = {
            color: C.MUTED,
            gridcolor: C.BORDER,
            tickfont: { size: 8, color: C.MUTED },
            type: "date" as const,
          };

          return (
            <div style={{ background: C.BG, padding: "8px 4px 0", display: "flex", gap: 8, alignItems: "flex-start" }}>

              {/* Left: rate + cumulative charts */}
              <div style={{ flex: "0 0 36%", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>

                {/* Time window filter */}
                <div style={{ display: "flex", gap: 4, paddingLeft: 2 }}>
                  {WINDOW_OPTIONS.map(o => (
                    <button
                      key={o.label}
                      onClick={() => setWindowHours(o.hours)}
                      style={{
                        padding: "2px 8px",
                        fontSize: "0.68rem",
                        fontWeight: windowHours === o.hours ? 700 : 400,
                        borderRadius: 4,
                        border: `1px solid ${windowHours === o.hours ? C.ACCENT : C.BORDER}`,
                        background: windowHours === o.hours ? C.ACCENT : C.CARD2,
                        color: windowHours === o.hours ? "#fff" : C.MUTED,
                        cursor: "pointer",
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {/* Rate chart */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 600, color: C.TEXT, paddingLeft: 2, marginBottom: 1 }}>
                    Ore Feed Rate &amp; Interval Tons
                    <span style={{ fontWeight: 400, color: C.MUTED, fontSize: "0.67rem", marginLeft: 5 }}>5-min · raw</span>
                  </div>
                  {filtered.length === 0 ? chartLoading : (
                    <Plot
                      data={[
                        {
                          type: "scatter", mode: "lines",
                          x: filtered.map(p => p.ts),
                          y: filtered.map(p => p.rate_thr),
                          yaxis: "y",
                          name: "Rate (t/hr)",
                          line: { color: C.ACCENT, width: 1.5 },
                          hovertemplate: "<b>%{y:.1f} t/hr</b><extra>Rate</extra>",
                        } as Plotly.Data,
                        {
                          type: "scatter", mode: "lines",
                          x: filtered.map(p => p.ts),
                          y: filtered.map(p => p.tons_interval),
                          yaxis: "y2",
                          name: "Tons/interval",
                          line: { color: "#4caf76", width: 1.2, dash: "dot" },
                          hovertemplate: "<b>%{y:.2f} t</b><extra>Interval</extra>",
                        } as Plotly.Data,
                      ]}
                      layout={{
                        height: 142,
                        paper_bgcolor: "transparent", plot_bgcolor: "transparent",
                        margin: { l: 44, r: 36, t: 4, b: 32 },
                        xaxis: chartAxisStyle,
                        yaxis: {
                          ...chartAxisStyle, type: undefined,
                          title: { text: "t/hr", font: { color: C.ACCENT, size: 8 } },
                          rangemode: "tozero", tickfont: { size: 8, color: C.ACCENT },
                        },
                        yaxis2: {
                          ...chartAxisStyle, type: undefined,
                          title: { text: "t", font: { color: "#4caf76", size: 8 } },
                          overlaying: "y", side: "right",
                          rangemode: "tozero", tickfont: { size: 8, color: "#4caf76" },
                          showgrid: false,
                        },
                        showlegend: false, font: { color: C.TEXT },
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

                {/* Cumulative chart */}
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 600, color: C.TEXT, paddingLeft: 2, marginBottom: 1 }}>
                    Cumulative Ore Fed
                    <span style={{ fontWeight: 400, color: C.MUTED, fontSize: "0.67rem", marginLeft: 5 }}>7-day running total</span>
                  </div>
                  {cumulative.length === 0 ? chartLoading : (
                    <Plot
                      data={[{
                        type: "scatter", mode: "lines",
                        x: cumulative.map(p => p.ts),
                        y: cumulative.map(p => p.cum),
                        line: { color: "#4caf76", width: 1.5 },
                        hovertemplate: "%{x|%d %b %H:%M}<br><b>%{y:.0f} t</b><extra></extra>",
                      } as Plotly.Data]}
                      layout={{
                        height: 142,
                        paper_bgcolor: "transparent", plot_bgcolor: "transparent",
                        margin: { l: 44, r: 6, t: 4, b: 32 },
                        xaxis: chartAxisStyle,
                        yaxis: { ...chartAxisStyle, type: undefined, title: { text: "t", font: { color: C.MUTED, size: 8 } }, rangemode: "tozero" },
                        showlegend: false, font: { color: C.TEXT },
                      } as Partial<Plotly.Layout>}
                      config={{ displayModeBar: false, responsive: true }}
                      useResizeHandler
                      style={{ width: "100%" }}
                    />
                  )}
                </div>
              </div>

              {/* Right: 3D heap */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Heap3DPreview rows={Object.values(data).flatMap(byPanel => Object.values(byPanel))} />
              </div>

            </div>
          );
        })()}
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
                  {p === 1 ? `Panel ${p}` : `← Panel ${p}`}
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

              return METRICS.map((metric, mi) => (
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
                      <div style={{ fontSize: "0.62rem", color: C.MUTED, fontWeight: 400, letterSpacing: "0.04em" }}>Step {step}</div>
                      <div>{cell}</div>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, margin: "4px auto 0" }} />
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
                        style={{ ...cellStyle(row, C, theme, mi === 0), cursor: row ? "default" : undefined }}
                        onMouseEnter={row ? (e) => setTooltip({ cell, panel, x: e.clientX, y: e.clientY }) : undefined}
                        onMouseMove={row ? (e) => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null) : undefined}
                        onMouseLeave={row ? () => setTooltip(null) : undefined}
                      >
                        {row ? metric.render(row) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {/* Floating tooltip */}
      {tooltip && (() => {
        const row = data[tooltip.cell]?.[tooltip.panel];
        if (!row) return null;
        const flipLeft = tooltip.x > window.innerWidth - 260;
        const flipUp   = tooltip.y > window.innerHeight - 320;
        return (
          <div style={{
            position: "fixed",
            left: flipLeft ? tooltip.x - 224 : tooltip.x + 14,
            top:  flipUp   ? tooltip.y - 20 - (METRICS.length * 26 + 48) : tooltip.y + 14,
            background: C.CARD,
            border: `1px solid ${C.BORDER}`,
            borderRadius: 8,
            padding: "10px 14px",
            zIndex: 9999,
            minWidth: 210,
            pointerEvents: "none",
            boxShadow: "0 4px 20px rgba(0,0,0,0.45)",
          }}>
            <div style={{ fontWeight: 700, color: C.ACCENT, marginBottom: 8, fontSize: "0.85rem", borderBottom: `1px solid ${C.BORDER}`, paddingBottom: 6 }}>
              Cell {tooltip.cell} — Panel {tooltip.panel}
            </div>
            {METRICS.map(m => (
              <div key={m.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, fontSize: "0.78rem", marginBottom: 5 }}>
                <span style={{ color: C.MUTED }}>{m.label}</span>
                <span style={{ color: C.TEXT, textAlign: "right" }}>{m.render(row)}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
