import { useEffect, useRef, useState, useMemo } from "react";
import Plot from "react-plotly.js";
import { PA_ORDER, paLabel } from "../constants";
import { useTheme } from "../theme";
import { api } from "../api";
import { SectionHeader } from "../components/KPIStrip";
import { Spinner } from "../components/FlowsheetChart";
import { DateRangeBar } from "../components/DateRangeBar";
import type { TagProfile, TrendPoint } from "../types";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

// Distinct colour per PA slot
const PA_PALETTE = [
  "#58a6ff", "#3fb950", "#d29922", "#f85149", "#bc8cff",
  "#ffa657", "#39d353", "#ff7b72", "#79c0ff", "#56d364",
  "#e3b341", "#db61a2",
];

interface SelTag {
  tag: string;
  desc: string;
  pa: string;
  unit: string;
  lo: number | null;
  hi: number | null;
}

export function CrossPATab({ activePAsOverride, onActivePAsChange }: { activePAsOverride?: Set<string>; onActivePAsChange?: (s: Set<string>) => void } = {}) {
  const today   = new Date();
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  const [allProfiles,   setAllProfiles]   = useState<TagProfile[]>([]);
  const [profLoading,   setProfLoading]   = useState(true);
  const { C, theme } = useTheme();
  const labelStyle: React.CSSProperties = { fontSize: "0.7rem", color: C.MUTED };
  const dateStyle: React.CSSProperties = {
    background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.TEXT,
    borderRadius: 4, padding: "3px 6px", fontSize: "0.75rem", colorScheme: theme as "dark" | "light",
  };
  const btnStyle: React.CSSProperties = {
    background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.ACCENT,
    borderRadius: 4, padding: "5px 14px", fontSize: "0.8rem", cursor: "pointer",
  };

  const [activePAsLocal, setActivePAsLocal] = useState<Set<string>>(new Set(["PA-1", "PA-2"]));
  const activePAs    = activePAsOverride ?? activePAsLocal;
  function setActivePAs(next: Set<string>) { setActivePAsLocal(next); onActivePAsChange?.(next); }
  const [dsFilter,      setDsFilter]      = useState<"Historian only" | "All sources">("All sources");
  const [search,        setSearch]        = useState("");
  const [selectedTags,  setSelectedTags]  = useState<SelTag[]>([]);
  const [start,         setStart]         = useState(isoDate(weekAgo));
  const [end,           setEnd]           = useState(isoDate(today));
  const [trendData,       setTrendData]       = useState<TrendPoint[]>([]);
  const [trendLoading,    setTrendLoading]    = useState(false);
  const [loadedBatches,   setLoadedBatches]   = useState(0);
  const [totalBatches,    setTotalBatches]    = useState(0);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

  useEffect(() => {
    api.allProfiles()
      .then(setAllProfiles)
      .catch(() => setAllProfiles([]))
      .finally(() => setProfLoading(false));
  }, []);

  // Auto-select PA-1 + PA-2 historian tags on first load
  const autoSelectRef = useRef(false);
  useEffect(() => {
    if (autoSelectRef.current || allProfiles.length === 0) return;
    const defaults = allProfiles.filter(
      (p) => ["PA-1", "PA-2"].includes(p.PerformanceArea) &&
              p.DataSource?.toLowerCase().includes("historian")
    ).map((p) => ({
      tag: p.Tag, desc: p.Description, pa: p.PerformanceArea,
      unit: p.Unit ?? "", lo: p.LowerLimit ?? null, hi: p.UpperLimit ?? null,
    }));
    if (defaults.length === 0) return;
    autoSelectRef.current = true;
    setSelectedTags(defaults);
  }, [allProfiles]);

  // Auto-load trends once tags are populated
  const autoLoadRef = useRef(false);
  useEffect(() => {
    if (autoLoadRef.current || selectedTags.length === 0) return;
    autoLoadRef.current = true;
    handleLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags]);

  // Derive ordered PA options from loaded profiles
  const paOpts = useMemo(() => {
    const rawAreas = new Set(allProfiles.map((p) => p.PerformanceArea));
    const available = new Set(rawAreas);
    return PA_ORDER.filter((a) => available.has(a));
  }, [allProfiles]);

  // Stable colour map: PA → colour (keyed by position in paOpts)
  const paColorMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    paOpts.forEach((pa, i) => { map[pa] = PA_PALETTE[i % PA_PALETTE.length]; });
    return map;
  }, [paOpts]);

  // Resolve colour for PA
  function colourForPA(pa: string): string {
    return paColorMap[pa] ?? "#aaa";
  }

  // Tags visible in the left picker
  const filteredProfiles = useMemo(() => {
    let profs = allProfiles.filter((p) => activePAs.has(p.PerformanceArea));
    if (dsFilter === "Historian only") {
      profs = profs.filter((p) => p.DataSource?.toLowerCase().includes("historian"));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      profs = profs.filter(
        (p) =>
          p.Description.toLowerCase().includes(q) ||
          paLabel(p.PerformanceArea).toLowerCase().includes(q) ||
          p.PerformanceArea.toLowerCase().includes(q) ||
          p.Tag.toLowerCase().includes(q)
      );
    }
    return profs;
  }, [allProfiles, activePAs, dsFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, TagProfile[]>();
    for (const p of filteredProfiles) {
      // key by actual PerformanceArea
      const key = p.PerformanceArea;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [filteredProfiles]);

  const selectedTagSet = new Set(selectedTags.map((t) => t.tag));

  function toggleTag(p: TagProfile) {
    if (selectedTagSet.has(p.Tag)) {
      setSelectedTags((prev) => prev.filter((t) => t.tag !== p.Tag));
    } else {
      setSelectedTags((prev) => [
        ...prev,
        { tag: p.Tag, desc: p.Description,
          // store actual PerformanceArea for labelling
          pa: p.PerformanceArea,
          unit: p.Unit ?? "", lo: p.LowerLimit ?? null, hi: p.UpperLimit ?? null },
      ]);
    }
  }

  function togglePA(pa: string) {
    const next = new Set(activePAs);
    if (next.has(pa)) {
      next.delete(pa);
      // deselect any tags from that PA
      setSelectedTags((prev) => prev.filter((t) => t.pa !== pa));
    } else {
      next.add(pa);
    }
    setActivePAs(next);
  }

  async function handleLoad() {
    const tags = selectedTags.map((t) => t.tag);
    if (tags.length === 0 || !start || !end) return;

    setTrendData([]);
    setLoadedBatches(0);
    setTrendLoading(true);

    const fetches: Promise<void>[] = [];
    let done = 0;
    const BATCH_SIZE = 10;
    const total = Math.ceil(tags.length / BATCH_SIZE);
    setTotalBatches(total);

    const finish = () => {
      done++;
      setLoadedBatches(done);
      if (done === total) { setTrendLoading(false); setHasAttemptedLoad(true); }
    };

    for (let i = 0; i < tags.length; i += BATCH_SIZE) {
      const batch = tags.slice(i, i + BATCH_SIZE);
      fetches.push(
        api.trends(batch, start, end)
          .then((rows) => {
            const clean = rows.filter((r) => r.Value !== null && Math.abs(r.Value!) < 1e10);
            setTrendData((prev) => [...prev, ...clean]);
          })
          .catch(() => {})
          .finally(finish)
      );
    }

    if (total === 0) { setTrendLoading(false); setHasAttemptedLoad(true); }
    void Promise.allSettled(fetches);
  }

  // Auto-fetch newly added tags when trend data is already loaded.
  // Intentionally silent (no trendLoading flag) so existing charts don't flash away.
  const prevTagsRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = new Set(prevTagsRef.current);
    const curr = selectedTags.map((t) => t.tag);
    const added = curr.filter((tag) => !prev.has(tag));
    prevTagsRef.current = curr;

    if (added.length === 0 || !hasAttemptedLoad || trendLoading || !start || !end) return;

    api.trends(added, start, end)
      .then((rows) => {
        const clean = rows.filter((r) => r.Value !== null && Math.abs(r.Value!) < 1e10);
        setTrendData((prev) => [...prev, ...clean]);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags]);

  // Clean up trend data for removed tags
  useEffect(() => {
    if (trendData.length === 0) return;
    const tagSet = new Set(selectedTags.map((t) => t.tag));
    setTrendData((prev) => prev.filter((r) => tagSet.has(r.Tag)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags]);

  const nCols = selectedTags.length > 1 ? 2 : 1;
  const hasLoadedData = !trendLoading && hasAttemptedLoad && selectedTags.length > 0;

  return (
    <div>
      <SectionHeader>
        Multi-PA Analysis&nbsp;
        <span style={{ fontSize: "0.55rem", color: C.MUTED, fontWeight: 400 }}>
          — pick sensors across any process areas and compare trends side-by-side
        </span>
      </SectionHeader>

      {profLoading ? <Spinner text="Loading tag profiles…" /> : (
        <>

          {/* ── Controls row ────────────────────────────────── */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Data source</label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                {(["Historian only", "All sources"] as const).map((opt) => (
                  <label key={opt} style={{ fontSize: "0.75rem", color: C.MUTED, cursor: "pointer" }}>
                    <input type="radio" checked={dsFilter === opt}
                           onChange={() => setDsFilter(opt)} style={{ marginRight: 4 }} />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Date range</label>
              <div style={{ marginTop: 4 }}>
                <DateRangeBar start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
              </div>
            </div>

            <button
              onClick={handleLoad}
              disabled={selectedTags.length === 0 || trendLoading}
              style={{
                ...btnStyle,
                opacity: selectedTags.length === 0 ? 0.45 : 1,
              }}
            >
              📊 Load Trends ({selectedTags.length})
            </button>
          </div>

          {/* ── Split picker panel ──────────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 14,
          }}>
            {/* Left: available tags */}
            <div style={{
              background: C.CARD,
              border: `1px solid ${C.BORDER}`,
              borderRadius: 6,
              padding: 10,
              display: "flex",
              flexDirection: "column",
            }}>
              <div style={{ fontSize: "0.72rem", color: C.TEXT, fontWeight: 600, marginBottom: 8 }}>
                Available Sensors{activePAs.size > 0 ? ` (${filteredProfiles.length})` : ""}
              </div>

              <input
                type="text"
                placeholder="Search by name, PA, or tag…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...dateStyle, width: "100%", boxSizing: "border-box", marginBottom: 8 }}
              />

              <div style={{ overflowY: "auto", maxHeight: 300, fontSize: "0.72rem" }}>
                {activePAs.size === 0 && (
                  <div style={{ color: C.MUTED, padding: "10px 4px" }}>
                    ☝️ Toggle a process area above to see its sensors here.
                  </div>
                )}
                {activePAs.size > 0 && grouped.size === 0 && (
                  <div style={{ color: C.MUTED, padding: "10px 4px" }}>No sensors match the current filter.</div>
                )}
                {Array.from(grouped.entries()).map(([pa, profs]) => (
                  <div key={pa}>
                    {/* Sticky PA header */}
                    <div style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      color: colourForPA(pa),
                      padding: "5px 4px 3px",
                      borderBottom: `1px solid ${C.BORDER}`,
                      marginBottom: 2,
                      position: "sticky",
                      top: 0,
                      background: C.CARD,
                    }}>
                      {paLabel(pa)} · {profs.length} sensor{profs.length !== 1 ? "s" : ""}
                    </div>
                    {profs.map((p) => {
                      const isSel = selectedTagSet.has(p.Tag);
                      const col   = colourForPA(pa);
                      return (
                        <div
                          key={p.Tag}
                          onClick={() => toggleTag(p)}
                          title={p.Tag}
                          style={{
                            padding: "4px 6px",
                            borderRadius: 3,
                            cursor: "pointer",
                            background: isSel ? col + "22" : "transparent",
                            color:      isSel ? col : C.TEXT,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            userSelect: "none",
                            marginBottom: 1,
                          }}
                        >
                          <span style={{ flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.Description}
                            {p.Unit ? <span style={{ color: C.MUTED }}> [{p.Unit}]</span> : null}
                          </span>
                          {isSel && (
                            <span style={{ fontSize: "0.65rem", color: col, marginLeft: 6, flexShrink: 0 }}>✓</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: selected tags basket */}
            <div style={{
              background: C.CARD,
              border: `1px solid ${C.BORDER}`,
              borderRadius: 6,
              padding: 10,
              display: "flex",
              flexDirection: "column",
            }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}>
                <div style={{ fontSize: "0.72rem", color: C.TEXT, fontWeight: 600 }}>
                  Selected ({selectedTags.length})
                </div>
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => { setSelectedTags([]); setTrendData([]); setHasAttemptedLoad(false); }}
                    style={{ ...btnStyle, padding: "2px 8px", fontSize: "0.65rem" }}
                  >
                    Clear all
                  </button>
                )}
              </div>

              {selectedTags.length === 0 ? (
                <div style={{ color: C.MUTED, fontSize: "0.72rem", padding: "10px 4px" }}>
                  Click a sensor on the left to add it here. Mix sensors from different process areas freely.
                </div>
              ) : (
                <div style={{ overflowY: "auto", maxHeight: 300, display: "flex", flexDirection: "column", gap: 5 }}>
                  {selectedTags.map((t) => {
                    const col = colourForPA(t.pa);
                    return (
                      <div
                        key={t.tag}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          background: col + "18",
                          border: `1px solid ${col}44`,
                          borderRadius: 4,
                          padding: "5px 8px",
                          fontSize: "0.72rem",
                        }}
                      >
                        <div style={{ flexGrow: 1, minWidth: 0 }}>
                          <div style={{ color: C.TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.desc}
                            {t.unit ? <span style={{ color: C.MUTED }}> [{t.unit}]</span> : null}
                          </div>
                          <div style={{ fontSize: "0.62rem", color: col, marginTop: 1 }}>{paLabel(t.pa)}</div>
                        </div>
                        <button
                          onClick={() => setSelectedTags((prev) => prev.filter((x) => x.tag !== t.tag))}
                          style={{
                            background: "none",
                            border: "none",
                            color: C.MUTED,
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            padding: "0 2px",
                            marginLeft: 6,
                            flexShrink: 0,
                            lineHeight: 1,
                          }}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Summary legend */}
              {selectedTags.length > 0 && (
                <div style={{ marginTop: "auto", paddingTop: 10, borderTop: `1px solid ${C.BORDER}` }}>
                  <div style={{ fontSize: "0.65rem", color: C.MUTED, marginBottom: 4 }}>Areas in selection:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {Array.from(new Set(selectedTags.map((t) => t.pa))).map((pa) => (
                      <span
                        key={pa}
                        style={{
                          background: colourForPA(pa) + "22",
                          border: `1px solid ${colourForPA(pa)}66`,
                          color: colourForPA(pa),
                          borderRadius: 10,
                          padding: "2px 7px",
                          fontSize: "0.65rem",
                        }}
                      >
                        {paLabel(pa)} ({selectedTags.filter((t) => t.pa === pa).length})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Trend charts ────────────────────────────────── */}
          <div style={{ borderTop: `1px solid ${C.BORDER}`, marginBottom: 10 }} />

          {trendLoading && (
            <Spinner text={
              totalBatches > 1
                ? `Querying ${selectedTags.length} sensor(s)… batch ${loadedBatches + 1}/${totalBatches}`
                : `Querying ${selectedTags.length} sensor(s)…`
            } />
          )}

          {hasLoadedData && selectedTags.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${nCols}, 1fr)`, gap: 8 }}>
              {selectedTags.map((t) => {
                const sub      = trendData.filter((r) => r.Tag === t.tag);
                const lineCol  = colourForPA(t.pa);

                const shapes: Partial<Plotly.Shape>[] = [];
                if (t.lo !== null) shapes.push({
                  type: "line", x0: 0, x1: 1, xref: "paper",
                  y0: t.lo, y1: t.lo, line: { color: C.WARN, dash: "dash", width: 1 },
                });
                if (t.hi !== null) shapes.push({
                  type: "line", x0: 0, x1: 1, xref: "paper",
                  y0: t.hi, y1: t.hi, line: { color: C.ALARM, dash: "dash", width: 1 },
                });

                if (sub.length === 0) return (
                  <div
                    key={`${t.tag}-${nCols}`}
                    style={{
                      background: C.CARD,
                      border: `1px solid ${C.BORDER}`,
                      padding: 12,
                      borderRadius: 5,
                      fontSize: "0.75rem",
                      minHeight: 230,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                    }}
                  >
                    <b style={{ color: C.TEXT }}>{t.desc}</b>
                    <div style={{ fontSize: "0.65rem", color: lineCol, marginBottom: 6 }}>{paLabel(t.pa)}</div>
                    <span style={{ color: C.MUTED }}>— no data in range</span>
                  </div>
                );

                return (
                  <div key={`${t.tag}-${nCols}`}>
                    <Plot
                      data={[{
                        x: sub.map((r) => r.Timestamp_AZ),
                        y: sub.map((r) => r.Value),
                        mode: "lines",
                        name: t.desc,
                        line: { color: lineCol, width: 1.5 },
                        hovertemplate: `<b>${t.desc}</b><br>%{x}<br>%{y:.3g}${t.unit ? " " + t.unit : ""}<extra></extra>`,
                      } as Plotly.Data]}
                      layout={{
                        height: 230,
                        title: {
                          text: `<b>${t.desc}</b>  <span style="font-size:9px;color:${lineCol}">${paLabel(t.pa)}</span>`,
                          font: { size: 11 },
                          x: 0,
                        },
                        margin: { l: 52, r: 18, t: 36, b: 36 },
                        plot_bgcolor: C.CARD,
                        paper_bgcolor: C.BG,
                        xaxis: {
                          gridcolor: C.BORDER, color: C.MUTED,
                          tickfont: { size: 9 }, automargin: true,
                        },
                        yaxis: {
                          gridcolor: C.BORDER, color: C.MUTED,
                          title: { text: t.unit || "Value" },
                          automargin: true, tickfont: { size: 9 },
                        },
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
