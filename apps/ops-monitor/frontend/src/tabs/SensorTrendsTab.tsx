import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { PA_ORDER, paLabel } from "../constants";
import { useTheme } from "../theme";
import { api } from "../api";
import { SectionHeader } from "../components/KPIStrip";
import { Spinner } from "../components/FlowsheetChart";
import { DateRangeBar } from "../components/DateRangeBar";
import type { TagProfile, TrendPoint } from "../types";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function statusColor(val: number | null, lo: number | null, hi: number | null) {
  const ALARM = "#f85149"; const WARN = "#d29922"; const OK = "#3fb950"; const OFF = "#484f58";
  if (val === null) return OFF;
  if ((lo !== null && val < lo) || (hi !== null && val > hi)) return ALARM;
  if (lo !== null && lo !== 0 && val < lo * 1.10) return WARN;
  if (hi !== null && hi !== 0 && val > hi * 0.90) return WARN;
  if (lo === null && hi === null) return OFF;
  return OK;
}


const _FLOW = PA_ORDER.map((pa) => ({ pa, label: paLabel(pa) }));
const FLOW_STEPS: { pa: string; label: string }[][] = [
  _FLOW.slice(0, 7),
  _FLOW.slice(7),
];

function FlowsheetPASelector({ selected, onSelect }: { selected: string; onSelect: (pa: string) => void }) {
  const { C } = useTheme();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{ border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "10px 14px", background: C.CARD, userSelect: "none" }}>
      <div style={{ fontSize: "0.65rem", color: C.MUTED, marginBottom: 8, fontStyle: "italic" }}>
        Click a process area → pick sensors → view trends
      </div>
      {FLOW_STEPS.map((row, ri) => (
        <div key={ri} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: ri < FLOW_STEPS.length - 1 ? 8 : 0, flexWrap: "wrap" }}>
          {row.map(({ pa, label }, i) => {
            const isSel = selected === pa;
            const isHov = hovered === pa;
            return (
              <div key={pa} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div
                  onClick={() => onSelect(pa)}
                  onMouseEnter={() => setHovered(pa)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: isSel ? 700 : 500,
                    fontSize: "0.75rem",
                    border: `2px solid ${isSel ? C.ACCENT : isHov ? C.ACCENT + "88" : C.BORDER}`,
                    background: isSel ? C.ACCENT + "22" : isHov ? C.ACCENT + "11" : C.CARD2,
                    color: isSel ? C.ACCENT : isHov ? C.ACCENT : C.TEXT,
                    transition: "all 0.12s",
                    whiteSpace: "nowrap",
                    boxShadow: isSel ? `0 0 8px ${C.ACCENT}44` : "none",
                  }}
                >
                  {label}
                </div>
                {i < row.length - 1 && (
                  <span style={{ color: C.BORDER, fontSize: "0.7rem" }}>→</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function SensorTrendsTab({ initialArea, onAreaChange }: { initialArea?: string; onAreaChange?: (pa: string) => void } = {}) {
  const { C, theme } = useTheme();
  const labelStyle: React.CSSProperties = { fontSize: "0.7rem", color: C.MUTED };
  const selectStyle: React.CSSProperties = {
    background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.TEXT,
    borderRadius: 4, padding: "4px 6px", fontSize: "0.75rem", marginTop: 4, width: "100%",
  };
  const dateStyle: React.CSSProperties = {
    background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.TEXT,
    borderRadius: 4, padding: "3px 6px", fontSize: "0.75rem", colorScheme: theme as "dark" | "light",
  };
  const btnStyle: React.CSSProperties = {
    background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.ACCENT,
    borderRadius: 4, padding: "5px 14px", fontSize: "0.8rem", cursor: "pointer",
  };
  const today   = new Date();
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  const [allProfiles, setAllProfiles] = useState<TagProfile[]>([]);
  const [profLoading, setProfLoading] = useState(true);

  const [selArea,      setSelArea]      = useState<string>(initialArea ?? "PA-1");
  const [dsFilter,     setDsFilter]     = useState<"Historian only" | "All sources">("All sources");
  const [selLabels,    setSelLabels]    = useState<string[]>([]);
  const [sensorSearch, setSensorSearch] = useState("");

  const [start,  setStart]  = useState(isoDate(weekAgo));
  const [end,    setEnd]    = useState(isoDate(today));

  const [trendTags,  setTrendTags]  = useState<string[]>([]);
  const [trendStart, setTrendStart] = useState("");
  const [trendEnd,   setTrendEnd]   = useState("");
  const [trendData,  setTrendData]  = useState<TrendPoint[]>([]);
  const [trendLoading,  setTrendLoading]  = useState(false);
  const [loadedBatches, setLoadedBatches] = useState(0);
  const [totalBatches,  setTotalBatches]  = useState(0);

  useEffect(() => {
    api.allProfiles()
      .then(setAllProfiles)
      .catch(() => setAllProfiles([]))
      .finally(() => setProfLoading(false));
  }, []);

  const _rawAreas = new Set(allProfiles.map((p) => p.PerformanceArea));
  const paOpts = PA_ORDER.filter((a) => _rawAreas.has(a));
  const dbAreas = [selArea];
  let areaProf = allProfiles.filter((p) => dbAreas.includes(p.PerformanceArea));
  if (dsFilter === "Historian only") {
    areaProf = areaProf.filter((p) => p.DataSource?.toLowerCase().includes("historian"));
  }
  const isMulti = dbAreas.length > 1;
  const makeLabel = (p: TagProfile) => {
    const base = p.Unit ? `${p.Description} [${p.Unit}]` : p.Description;
    return isMulti ? `${paLabel(p.PerformanceArea)} · ${base}` : base;
  };
  const labelToTag = Object.fromEntries(areaProf.map((p) => [makeLabel(p), p.Tag]));
  const allLabels  = areaProf.map(makeLabel);

  async function handleLoad() {
    const tags = selLabels.map((l) => labelToTag[l]).filter(Boolean);
    if (tags.length === 0 || !start || !end) return;
    setTrendTags(tags);
    setTrendStart(start);
    setTrendEnd(end);
    setTrendData([]);
    setLoadedBatches(0);

    const BATCH_SIZE = 10;
    const batches: string[][] = [];
    for (let i = 0; i < tags.length; i += BATCH_SIZE) {
      batches.push(tags.slice(i, i + BATCH_SIZE));
    }
    setTotalBatches(batches.length);
    setTrendLoading(true);

    let done = 0;
    const promises = batches.map((batch) =>
      api.trends(batch, start, end)
        .then((rows) => {
          const clean = rows.filter((r) => r.Value !== null && Math.abs(r.Value!) < 1e10);
          setTrendData((prev) => [...prev, ...clean]);
        })
        .catch(() => {/* batch failed silently — other batches still render */})
        .finally(() => {
          done++;
          setLoadedBatches(done);
          if (done === batches.length) setTrendLoading(false);
        })
    );
    void Promise.allSettled(promises);
  }

  const tagMeta = Object.fromEntries(allProfiles.filter((p) => trendTags.includes(p.Tag)).map((p) => [p.Tag, p]));
  const nCols = trendTags.length > 1 ? 2 : 1;

  // Auto-select all sensors and load when PA changes
  useEffect(() => {
    if (allLabels.length === 0) return;
    setSelLabels(allLabels);
  }, [selArea, dsFilter, allLabels.length]); // eslint-disable-line

  // Auto-load once selLabels are set for a new PA
  const autoLoadRef = useState<string>("")
  useEffect(() => {
    if (selLabels.length === 0) return;
    const key = selLabels.join(",") + start + end;
    if (key === autoLoadRef[0]) return;
    autoLoadRef[1](key);
    handleLoad();
  }, [selLabels.length, selArea]); // eslint-disable-line

  return (
    <div>
      <SectionHeader>
        Sensor Trend Explorer&nbsp;
        <span style={{ fontSize: "0.55rem", color: "#8b949e", fontWeight: 400 }}>
          — sensors ordered by analytics priority (Id)
        </span>
      </SectionHeader>

      {profLoading ? <Spinner text="Loading tag profiles…" /> : (
        <>
          {/* ── Side-by-side: flowsheet left, selector right ── */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 55%) minmax(0, 45%)", gap: 12, marginBottom: 10, alignItems: "start" }}>

            {/* Left: clickable flowsheet */}
            <FlowsheetPASelector
              selected={selArea}
              onSelect={(pa) => { setSelArea(pa); onAreaChange?.(pa); setSelLabels([]); setSensorSearch(""); }}
            />

            {/* Right: sensor selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

              {/* PA dropdown */}
              <div>
                <label style={labelStyle}>Process Area</label>
                <select
                  value={selArea}
                  onChange={(e) => { setSelArea(e.target.value); onAreaChange?.(e.target.value); setSelLabels([]); setSensorSearch(""); }}
                  style={selectStyle}
                >
                  {paOpts.map((a) => <option key={a} value={a}>{paLabel(a)}</option>)}
                </select>
              </div>

              {/* Selected PA + data source */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.8rem", color: C.ACCENT, fontWeight: 700 }}>{paLabel(selArea)}</span>
                <div style={{ display: "flex", gap: 10 }}>
                  {(["Historian only", "All sources"] as const).map((opt) => (
                    <label key={opt} style={{ fontSize: "0.72rem", color: C.MUTED, cursor: "pointer" }}>
                      <input type="radio" checked={dsFilter === opt}
                             onChange={() => setDsFilter(opt)} style={{ marginRight: 4 }} />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>


              {/* Sensor list */}
              <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 6, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: "0.7rem", color: C.MUTED }}>
                    {areaProf.length} sensors · {selLabels.length} selected
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setSelLabels(allLabels)} style={{ ...btnStyle, padding: "2px 8px", fontSize: "0.65rem" }}>
                      Select all
                    </button>
                    {selLabels.length > 0 && (
                      <button onClick={() => setSelLabels([])} style={{ ...btnStyle, padding: "2px 8px", fontSize: "0.65rem" }}>
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Search sensors…"
                  value={sensorSearch}
                  onChange={(e) => setSensorSearch(e.target.value)}
                  style={{ ...dateStyle, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
                />
                <div style={{ maxHeight: 300, overflowY: "auto", fontSize: "0.72rem" }}>
                  {allLabels
                    .filter((l) => !sensorSearch.trim() || l.toLowerCase().includes(sensorSearch.toLowerCase()))
                    .map((l) => {
                      const isSel = selLabels.includes(l);
                      return (
                        <div key={l}
                          onClick={() => setSelLabels((prev) => isSel ? prev.filter((x) => x !== l) : [...prev, l])}
                          style={{
                            padding: "4px 6px", borderRadius: 3, cursor: "pointer",
                            background: isSel ? C.ACCENT + "22" : "transparent",
                            color: isSel ? C.ACCENT : C.TEXT,
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            userSelect: "none", marginBottom: 1,
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
                          {isSel && <span style={{ fontSize: "0.65rem", color: C.ACCENT, marginLeft: 6, flexShrink: 0 }}>✓</span>}
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Date range + Load */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <DateRangeBar start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
                <button
                  onClick={handleLoad}
                  disabled={selLabels.length === 0}
                  style={{ ...btnStyle, opacity: selLabels.length === 0 ? 0.45 : 1 }}
                >
                  📊 Load Trends ({selLabels.length})
                </button>
              </div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.BORDER}`, margin: "4px 0 8px" }} />

          {trendLoading && (
            <Spinner text={
              totalBatches > 1
                ? `Querying ${trendTags.length} sensor(s)… batch ${loadedBatches + 1}/${totalBatches}`
                : `Querying ${trendTags.length} sensor(s)…`
            } />
          )}

          {!trendLoading && trendTags.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${nCols}, 1fr)`, gap: 8 }}>
              {trendTags.map((tag) => {
                const meta  = tagMeta[tag];
                const desc  = meta?.Description ?? tag;
                const unit  = meta?.Unit ?? "";
                const lo    = meta?.LowerLimit ?? null;
                const hi    = meta?.UpperLimit ?? null;
                const cont  = meta?.Container ?? "";
                const ds    = meta?.DataSource ?? "";
                const sub   = trendData.filter((r) => r.Tag === tag);
                const subtitle = [cont, ds].filter(Boolean).join(" · ");

                if (sub.length === 0) return (
                  <div key={tag} style={{ background: C.CARD, border: `1px solid ${C.BORDER}`,
                                          padding: 12, borderRadius: 5, fontSize: "0.75rem" }}>
                    <b style={{ color: C.TEXT }}>{desc}</b>
                    <span style={{ color: C.MUTED }}> — no data in range</span>
                  </div>
                );

                const lastVal   = sub[sub.length - 1].Value;
                const lineColor = statusColor(lastVal, lo, hi);

                const shapes: Partial<Plotly.Shape>[] = [];
                if (lo !== null) shapes.push({ type: "line", x0: 0, x1: 1, xref: "paper",
                  y0: lo, y1: lo, line: { color: C.WARN, dash: "dash", width: 1 } });
                if (hi !== null) shapes.push({ type: "line", x0: 0, x1: 1, xref: "paper",
                  y0: hi, y1: hi, line: { color: C.ALARM, dash: "dash", width: 1 } });

                return (
                  <div key={tag}>
                    <Plot
                      data={[{
                        x: sub.map((r) => r.Timestamp_AZ),
                        y: sub.map((r) => r.Value),
                        mode: "lines",
                        name: desc,
                        line: { color: lineColor, width: 1.5 },
                        hovertemplate: `<b>${desc}</b><br>%{x}<br>%{y:.3g} ${unit}<extra></extra>`,
                      } as Plotly.Data]}
                      layout={{
                        height: 230,
                        title: { text: `<b>${desc}</b>${subtitle ? `  <span style="font-size:9px;color:${C.MUTED}">${subtitle}</span>` : ""}`,
                                 font: { size: 11 }, x: 0 },
                        margin: { l: 52, r: 18, t: 8, b: 36 },
                        plot_bgcolor: C.CARD,
                        paper_bgcolor: C.BG,
                        xaxis: { gridcolor: C.BORDER, color: C.MUTED, tickfont: { size: 9 }, automargin: true },
                        yaxis: { gridcolor: C.BORDER, color: C.MUTED, title: { text: unit || "Value" },
                                 automargin: true, tickfont: { size: 9 } },
                        hovermode: "x unified",
                        showlegend: false,
                        font: { color: C.MUTED, size: 10 },
                        shapes,
                      } as Partial<Plotly.Layout>}
                      config={{ displayModeBar: false, responsive: true }}
                      useResizeHandler
                      style={{ width: "100%" }}
                    />
                    <div style={{ fontSize: "0.65rem", color: C.MUTED }}>
                      {sub.length.toLocaleString()} readings ·{" "}
                      {sub[0].Timestamp_AZ} → {sub[sub.length - 1].Timestamp_AZ}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// styles moved inside SensorTrendsTab() using C from useTheme()
