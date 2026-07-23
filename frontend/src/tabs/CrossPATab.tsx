import { useEffect, useRef, useState, useMemo } from "react";
import Plot from "react-plotly.js";
import { BIGF_AREAS } from "../constants";
import { useTheme } from "../theme";
import { api } from "../api";
import { SectionHeader } from "../components/KPIStrip";
import { Spinner } from "../components/FlowsheetChart";
import { DateRangeBar } from "../components/DateRangeBar";
import type { TagProfile, TrendPoint, BioReactorPoint } from "../types";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

const _PA_ORDER = [
  "Mining", "Crushing", "Agglomeration", "Stacking", "Leaching",
  "PLS SX EW", "Raffinate", "BIGF Bioreactors", "BIGF Common Skid", "Scale Up Bioreactors",
];
const _BIGF4 = new Set(["BIGF1", "BIGF2", "BIGF3", "BIGF4"]);

// Some display PA names map to multiple PerformanceArea values in the DB
const PA_EXPAND: Record<string, string[]> = {
  "BIGF Bioreactors": ["BIGF1", "BIGF2", "BIGF3", "BIGF4"],
};
// Reverse map: db PerformanceArea → display PA name (for colour lookup)
const DB_PA_TO_DISPLAY: Record<string, string> = {};
for (const [display, dbs] of Object.entries(PA_EXPAND)) {
  for (const db of dbs) DB_PA_TO_DISPLAY[db] = display;
}
function displayPA(dbPA: string): string {
  return DB_PA_TO_DISPLAY[dbPA] ?? dbPA;
}

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

  const [activePAsLocal, setActivePAsLocal] = useState<Set<string>>(new Set(["Mining", "Crushing"]));
  const activePAs    = activePAsOverride ?? activePAsLocal;
  function setActivePAs(next: Set<string>) { setActivePAsLocal(next); onActivePAsChange?.(next); }
  const [bigfSubAreas,  setBigfSubAreas]  = useState<Set<string>>(new Set(["BIGF1"]));
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

  // Scale Up bio-reactor specific state
  const [bioData,   setBioData]   = useState<BioReactorPoint[]>([]);
  const [bioLimits, setBioLimits] = useState<Record<string, Record<string, [number, number]>>>({});

  /** Returns true if a SelTag comes from the Scale Up bio-reactor data source */
  function isBioTag(tag: string): boolean {
    const prof = allProfiles.find((p) => p.Tag === tag);
    return prof?.DataSource === "Bio Reactor" && prof?.PerformanceArea === "Scale Up Bioreactors";
  }

  useEffect(() => {
    api.allProfiles()
      .then(setAllProfiles)
      .catch(() => setAllProfiles([]))
      .finally(() => setProfLoading(false));
  }, []);

  // Auto-select all Mining + Crushing historian tags on first load
  const autoSelectRef = useRef(false);
  useEffect(() => {
    if (autoSelectRef.current || allProfiles.length === 0) return;
    const defaults = allProfiles.filter(
      (p) => ["Mining", "Crushing"].includes(p.PerformanceArea) &&
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
    const hasBigf  = [...rawAreas].some((a) => _BIGF4.has(a));
    const available = new Set([...rawAreas].filter((a) => !_BIGF4.has(a)));
    if (hasBigf) available.add("BIGF Bioreactors");
    return _PA_ORDER.filter((a) => available.has(a));
  }, [allProfiles]);

  // Stable colour map: PA → colour (keyed by position in paOpts)
  const paColorMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    paOpts.forEach((pa, i) => { map[pa] = PA_PALETTE[i % PA_PALETTE.length]; });
    return map;
  }, [paOpts]);

  // Resolve colour for any PA — BIGF1/2/3/4 share the "BIGF Bioreactors" colour
  function colourForPA(pa: string): string {
    return paColorMap[pa] ?? paColorMap[displayPA(pa)] ?? "#aaa";
  }

  // Tags visible in the left picker
  const filteredProfiles = useMemo(() => {
    const expandedPAs = new Set(
      Array.from(activePAs).flatMap((pa) =>
        pa === "BIGF Bioreactors" ? Array.from(bigfSubAreas) : (PA_EXPAND[pa] ?? [pa])
      )
    );
    let profs = allProfiles.filter((p) => expandedPAs.has(p.PerformanceArea));
    if (dsFilter === "Historian only") {
      profs = profs.filter((p) => p.DataSource?.toLowerCase().includes("historian"));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      profs = profs.filter(
        (p) =>
          p.Description.toLowerCase().includes(q) ||
          p.PerformanceArea.toLowerCase().includes(q) ||
          p.Tag.toLowerCase().includes(q)
      );
    }
    return profs;
  }, [allProfiles, activePAs, bigfSubAreas, dsFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, TagProfile[]>();
    for (const p of filteredProfiles) {
      // key by actual PerformanceArea so BIGF1/BIGF2/etc get separate sections
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
          // store actual PerformanceArea (BIGF1, BIGF2, etc.) for labelling
          pa: p.PerformanceArea,
          unit: p.Unit ?? "", lo: p.LowerLimit ?? null, hi: p.UpperLimit ?? null },
      ]);
    }
  }

  function togglePA(pa: string) {
    const next = new Set(activePAs);
    if (next.has(pa)) {
      next.delete(pa);
      // deselect any tags from that PA (expand to sub-areas for grouped PAs like BIGF)
      const expanded = new Set(PA_EXPAND[pa] ?? [pa]);
      setSelectedTags((prev) => prev.filter((t) => !expanded.has(t.pa) && t.pa !== pa));
    } else {
      next.add(pa);
    }
    setActivePAs(next);
  }

  async function handleLoad() {
    const tags = selectedTags.map((t) => t.tag);
    if (tags.length === 0 || !start || !end) return;

    const bioTags  = tags.filter(isBioTag);
    const histTags = tags.filter((t) => !isBioTag(t));

    setTrendData([]);
    setBioData([]);
    setLoadedBatches(0);
    setTrendLoading(true);

    const fetches: Promise<void>[] = [];
    let done = 0;
    const total = (histTags.length > 0 ? Math.ceil(histTags.length / 10) : 0) + (bioTags.length > 0 ? 1 : 0);
    setTotalBatches(total);

    const finish = () => {
      done++;
      setLoadedBatches(done);
      if (done === total) { setTrendLoading(false); setHasAttemptedLoad(true); }
    };

    // ── Historian / non-bio tags ───────────────────────────────────────────
    if (histTags.length > 0) {
      const BATCH_SIZE = 10;
      for (let i = 0; i < histTags.length; i += BATCH_SIZE) {
        const batch = histTags.slice(i, i + BATCH_SIZE);
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
    }

    // ── Scale Up bio-reactor tags ──────────────────────────────────────────
    if (bioTags.length > 0) {
      fetches.push(
        api.bioReactorDaily(bioTags, start, end)
          .then(({ points, limits }) => {
            setBioData(points.filter((p) => p.Value !== null && Math.abs(p.Value) < 1e10));
            setBioLimits(limits);
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

    const addedBio  = added.filter(isBioTag);
    const addedHist = added.filter((t) => !isBioTag(t));

    if (addedHist.length > 0) {
      api.trends(addedHist, start, end)
        .then((rows) => {
          const clean = rows.filter((r) => r.Value !== null && Math.abs(r.Value!) < 1e10);
          setTrendData((prev) => [...prev, ...clean]);
        })
        .catch(() => {});
    }
    if (addedBio.length > 0) {
      api.bioReactorDaily(addedBio, start, end)
        .then(({ points, limits }) => {
          setBioData((prev) => [...prev, ...points.filter((p) => p.Value !== null && Math.abs(p.Value) < 1e10)]);
          setBioLimits((prev) => ({ ...prev, ...limits }));
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags]);

  // Clean up trend data for removed tags
  useEffect(() => {
    if (trendData.length === 0) return;
    const tagSet = new Set(selectedTags.map((t) => t.tag));
    setTrendData((prev) => prev.filter((r) => tagSet.has(r.Tag)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags]);

  const nonBioTags = selectedTags.filter((t) => !isBioTag(t.tag));
  const nCols = nonBioTags.length > 1 ? 2 : 1;
  const hasLoadedData = !trendLoading && hasAttemptedLoad && selectedTags.length > 0;

  return (
    <div>
      <SectionHeader>
        Multi-PA Analysis&nbsp;
        <span style={{ fontSize: "0.55rem", color: C.MUTED, fontWeight: 400 }}>
          — pick sensors across any Performance Areas and compare trends side-by-side
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
                    ☝️ Toggle a Performance Area above to see its sensors here.
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
                      {pa} · {profs.length} sensor{profs.length !== 1 ? "s" : ""}
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
                    onClick={() => { setSelectedTags([]); setTrendData([]); setBioData([]); setBioLimits({}); setHasAttemptedLoad(false); }}
                    style={{ ...btnStyle, padding: "2px 8px", fontSize: "0.65rem" }}
                  >
                    Clear all
                  </button>
                )}
              </div>

              {selectedTags.length === 0 ? (
                <div style={{ color: C.MUTED, fontSize: "0.72rem", padding: "10px 4px" }}>
                  Click a sensor on the left to add it here. Mix sensors from different PAs freely.
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
                          <div style={{ fontSize: "0.62rem", color: col, marginTop: 1 }}>{t.pa}</div>
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
                  <div style={{ fontSize: "0.65rem", color: C.MUTED, marginBottom: 4 }}>PAs in selection:</div>
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
                        {pa} ({selectedTags.filter((t) => t.pa === pa).length})
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

          {hasLoadedData && nonBioTags.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${nCols}, 1fr)`, gap: 8 }}>
              {nonBioTags.map((t) => {
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
                    <div style={{ fontSize: "0.65rem", color: lineCol, marginBottom: 6 }}>{t.pa}</div>
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
                          text: `<b>${t.desc}</b>  <span style="font-size:9px;color:${lineCol}">${t.pa}</span>`,
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

          {/* ── Scale Up Bio-Reactor charts (multi-series per measure) ── */}
          <BioReactorCharts
            selectedTags={selectedTags}
            bioData={bioData}
            bioLimits={bioLimits}
            isBioTag={isBioTag}
            colourForPA={colourForPA}
            hasAttemptedLoad={hasAttemptedLoad}
            C={C}
          />
        </>
      )}
    </div>
  );
}

// ── Bio Reactor sub-component ─────────────────────────────────────────────────

const BIO_CONTAINER_PALETTE = [
  "#58a6ff","#3fb950","#d29922","#bc8cff","#ffa657",
  "#39d353","#ff7b72","#79c0ff","#56d364","#e3b341","#db61a2",
];

interface BioReactorChartsProps {
  selectedTags:     SelTag[];
  bioData:          BioReactorPoint[];
  bioLimits:        Record<string, Record<string, [number, number]>>;
  isBioTag:         (tag: string) => boolean;
  colourForPA:      (pa: string) => string;
  hasAttemptedLoad: boolean;
  C:                Record<string, string>;
}

function BioReactorCharts({ selectedTags, bioData, bioLimits, isBioTag, colourForPA, hasAttemptedLoad, C }: BioReactorChartsProps) {
  const bioSelected = selectedTags.filter((t) => isBioTag(t.tag));

  // Derive filter options from loaded data
  const allContainers = useMemo(() => Array.from(new Set(bioData.map((p) => p.Container))).sort(), [bioData]);
  const allTemps      = useMemo(() => Array.from(new Set(bioData.map((p) => p.Temperature))).sort(), [bioData]);
  const allVolumes    = useMemo(() => Array.from(new Set(bioData.map((p) => p.Volume != null ? String(p.Volume) : ""))).filter(Boolean).sort((a, b) => Number(a) - Number(b)), [bioData]);

  const [activeCont, setActiveCont] = useState<Set<string>>(new Set());
  const [activeTemp, setActiveTemp] = useState<Set<string>>(new Set());
  const [activeVol,  setActiveVol]  = useState<Set<string>>(new Set());

  // Sync filter sets when data changes (select all by default)
  useEffect(() => { setActiveCont(new Set(allContainers)); }, [allContainers.join(",")]);
  useEffect(() => { setActiveTemp(new Set(allTemps));      }, [allTemps.join(",")]);
  useEffect(() => { setActiveVol(new Set(allVolumes));     }, [allVolumes.join(",")]);

  if (!hasAttemptedLoad || bioSelected.length === 0) return null;

  // Assign stable colours per container
  const containerColor: Record<string, string> = {};
  allContainers.forEach((c, i) => { containerColor[c] = BIO_CONTAINER_PALETTE[i % BIO_CONTAINER_PALETTE.length]; });

  // Apply filters
  const filteredData = bioData.filter((p) =>
    activeCont.has(p.Container) &&
    activeTemp.has(p.Temperature) &&
    (allVolumes.length === 0 || (p.Volume != null && activeVol.has(String(p.Volume))))
  );

  const bioCols = bioSelected.length > 1 ? 2 : 1;

  function toggle(set: Set<string>, val: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    next.has(val) ? next.delete(val) : next.add(val);
    setter(next);
  }

  const filterLabelStyle: React.CSSProperties = { fontSize: "0.65rem", color: C.MUTED };
  const chipStyle = (active: boolean, col: string): React.CSSProperties => ({
    fontSize: "0.68rem", cursor: "pointer", padding: "2px 8px", borderRadius: 10,
    background: active ? col + "22" : "transparent",
    border: `1px solid ${active ? col : C.BORDER}`,
    color: active ? col : C.MUTED,
    userSelect: "none" as const,
  });

  return (
    <div style={{ marginTop: 10 }}>
      {/* ── Filter bar ────────────────────────────────────────── */}
      {bioData.length > 0 && (
        <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 5, padding: "8px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            {allContainers.length > 0 && (
              <div>
                <div style={filterLabelStyle}>Container</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                  {allContainers.map((c) => (
                    <span key={c} style={chipStyle(activeCont.has(c), containerColor[c])}
                      onClick={() => toggle(activeCont, c, setActiveCont)}>{c}</span>
                  ))}
                </div>
              </div>
            )}
            {allTemps.length > 0 && (
              <div>
                <div style={filterLabelStyle}>Temperature profile</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                  {allTemps.map((t) => (
                    <span key={t} style={chipStyle(activeTemp.has(t), C.ACCENT)}
                      onClick={() => toggle(activeTemp, t, setActiveTemp)}>{t}</span>
                  ))}
                </div>
              </div>
            )}
            {allVolumes.length > 0 && (
              <div>
                <div style={filterLabelStyle}>Volume (L)</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
                  {allVolumes.map((v) => (
                    <span key={v} style={chipStyle(activeVol.has(v), C.ACCENT)}
                      onClick={() => toggle(activeVol, v, setActiveVol)}>{v} L</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ fontSize: "0.68rem", color: C.MUTED, marginBottom: 6 }}>
        Scale Up Bioreactors — daily actuals per container
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${bioCols}, 1fr)`, gap: 8 }}>
        {bioSelected.map((t) => {
          const pts     = filteredData.filter((p) => p.Measure === t.tag);
          const lineCol = colourForPA(t.pa);

          if (pts.length === 0) return (
            <div key={`bio-${t.tag}-${bioCols}`} style={{
              background: C.CARD, border: `1px solid ${C.BORDER}`,
              borderRadius: 5, padding: 12, minHeight: 230,
              display: "flex", flexDirection: "column", justifyContent: "center", fontSize: "0.75rem",
            }}>
              <b style={{ color: C.TEXT }}>{t.desc}</b>
              <div style={{ fontSize: "0.65rem", color: lineCol, marginBottom: 6 }}>{t.pa}</div>
              <span style={{ color: C.MUTED }}>— no data for current filter selection</span>
            </div>
          );

          // Group points by Container
          const byContainer = pts.reduce<Record<string, BioReactorPoint[]>>((acc, p) => {
            (acc[p.Container] ??= []).push(p);
            return acc;
          }, {});

          const traces: Plotly.Data[] = Object.entries(byContainer).map(([container, cpts]) => ({
            x: cpts.map((p) => p.Date),
            y: cpts.map((p) => p.Value),
            mode: "lines+markers" as const,
            name: container,
            line:   { color: containerColor[container] ?? "#aaa", width: 1.5 },
            marker: { size: 4 },
            hovertemplate: `<b>${container}</b><br>%{x|%b %d, %Y}<br>%{y:.3g}${t.unit ? " " + t.unit : ""}<extra></extra>`,
          }));

          // Limit shapes per active temperature profile
          const shapes: Partial<Plotly.Shape>[] = [];
          const tempsInFiltered = Array.from(new Set(pts.map((p) => p.Temperature)));
          const limitsForMeasure = bioLimits[t.tag] ?? {};
          tempsInFiltered.forEach((temp) => {
            const bounds = limitsForMeasure[temp];
            if (!bounds) return;
            const [lo, hi] = bounds;
            shapes.push({ type: "line", x0: 0, x1: 1, xref: "paper", y0: lo, y1: lo, line: { color: C.WARN,  dash: "dash", width: 1 } });
            shapes.push({ type: "line", x0: 0, x1: 1, xref: "paper", y0: hi, y1: hi, line: { color: C.ALARM, dash: "dash", width: 1 } });
          });

          const containers = Object.keys(byContainer).sort();
          return (
            <div key={`bio-${t.tag}-${bioCols}`}>
              <Plot
                data={traces}
                layout={{
                  height: 260,
                  title: { text: `<b>${t.desc}</b>  <span style="font-size:9px;color:${lineCol}">${t.pa}</span>`, font: { size: 11 }, x: 0 },
                  margin: { l: 52, r: 18, t: 36, b: 36 },
                  plot_bgcolor:  C.CARD,
                  paper_bgcolor: C.BG,
                  xaxis:  { gridcolor: C.BORDER, color: C.MUTED, tickfont: { size: 9 }, automargin: true },
                  yaxis:  { gridcolor: C.BORDER, color: C.MUTED, title: { text: t.unit || "Value" }, automargin: true, tickfont: { size: 9 } },
                  legend: { font: { size: 9, color: C.MUTED }, bgcolor: "transparent" },
                  hovermode: "x unified",
                  font:   { color: C.MUTED, size: 10 },
                  shapes,
                } as Partial<Plotly.Layout>}
                config={{ displayModeBar: false, responsive: true }}
                useResizeHandler
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: "0.65rem", color: C.MUTED }}>
                {pts.length.toLocaleString()} readings · {containers.join(", ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// styles are defined inside CrossPATab() using C from useTheme()
