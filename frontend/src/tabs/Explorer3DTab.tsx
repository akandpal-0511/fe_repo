import { useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { useTheme } from "../theme";
import type { Colors } from "../theme";
import { api } from "../api";
import { Spinner } from "../components/FlowsheetChart";
import { SectionHeader } from "../components/KPIStrip";
import { DateRangeBar } from "../components/DateRangeBar";
import type { TagProfile, TrendPoint } from "../types";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

const _PA_ORDER = [
  "Mining", "Crushing", "Agglomeration", "Stacking", "Leaching",
  "PLS SX EW", "Raffinate", "BIGF Bioreactors", "BIGF Common Skid", "Scale Up Bioreactors",
];
const _BIGF4 = new Set(["BIGF1", "BIGF2", "BIGF3", "BIGF4"]);

function SearchableSelect({ value, options, onChange, selStyle }: {
  value: string; options: string[]; onChange: (v: string) => void; selStyle: React.CSSProperties;
}) {
  const { C } = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const filtered = search.trim() ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase())) : options;

  useEffect(() => {
    function handle(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", marginTop: 4 }}>
      <div onClick={() => setOpen((o) => !o)} style={{ ...selStyle, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{value || "Select…"}</span>
        <span style={{ marginLeft: 6, fontSize: "0.65rem" }}>▾</span>
      </div>
      {open && (
        <div style={{ position: "absolute", zIndex: 200, top: "100%", left: 0, right: 0, background: C.CARD2, border: `1px solid ${C.BORDER}`, borderRadius: 4, minWidth: 220 }}>
          <input
            autoFocus
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", background: C.CARD, border: "none", borderBottom: `1px solid ${C.BORDER}`, color: C.TEXT, fontSize: "0.75rem", outline: "none" }}
          />
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0
              ? <div style={{ padding: "6px 10px", color: C.MUTED, fontSize: "0.72rem" }}>No matches</div>
              : filtered.map((o) => (
                <div key={o}
                  onMouseDown={() => { onChange(o); setOpen(false); setSearch(""); }}
                  style={{ padding: "5px 10px", cursor: "pointer", fontSize: "0.75rem",
                    color: o === value ? C.ACCENT : C.TEXT,
                    background: o === value ? C.ACCENT + "22" : "transparent" }}>
                  {o}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function mkStyles(C: Colors, theme: "dark" | "light") {
  return {
    lbl:   { fontSize: "0.7rem", color: C.MUTED } as React.CSSProperties,
    sel:   { background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.TEXT, borderRadius: 4, padding: "4px 6px", fontSize: "0.75rem", marginTop: 4, width: "100%" } as React.CSSProperties,
    dtInp: { background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.TEXT, borderRadius: 4, padding: "3px 6px", fontSize: "0.75rem", colorScheme: theme as "dark" | "light" } as React.CSSProperties,
    btn:   { background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.ACCENT, borderRadius: 4, padding: "5px 14px", fontSize: "0.8rem", cursor: "pointer" } as React.CSSProperties,
  };
}

export function Explorer3DTab() {
  const { C } = useTheme();
  const today   = new Date();
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const [tab, setTab] = useState<"scatter" | "surface" | "padmap">("scatter");

  return (
    <div>
      <div style={{ display: "flex", gap: 0, marginBottom: 10, borderBottom: `1px solid ${C.BORDER}` }}>
        {([
          ["scatter", "🔵 3D Scatter — Tag Correlations"],
          ["surface", "🌊 3D Surface — Multi-Tag Timeline"],
          ["padmap",  "🏗️ Leach Pad Map"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: tab === key ? C.CARD : "none",
            border: "none",
            borderBottom: tab === key ? `2px solid ${C.ACCENT}` : "2px solid transparent",
            color: tab === key ? C.ACCENT : C.MUTED,
            padding: "6px 14px",
            fontSize: "0.8rem",
            cursor: "pointer",
            fontWeight: tab === key ? 700 : 400,
          }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "scatter" && <ScatterPanel weekAgo={weekAgo} today={today} />}
      {tab === "surface" && <SurfacePanel weekAgo={weekAgo} />}
      {tab === "padmap"  && <LeachPadPanel weekAgo={weekAgo} today={today} />}
    </div>
  );
}


function ScatterPanel({ weekAgo, today }: { weekAgo: Date; today: Date }) {
  const { C, theme } = useTheme();
  const { lbl, sel, btn } = mkStyles(C, theme);
  const [allProfiles, setAllProfiles] = useState<TagProfile[]>([]);
  const [selArea,  setSelArea]  = useState("");
  const [start,    setStart]    = useState(isoDate(weekAgo));
  const [end,      setEnd]      = useState(isoDate(today));
  const [xLbl,     setXLbl]     = useState("");
  const [yLbl,     setYLbl]     = useState("");
  const [zLbl,     setZLbl]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [figure,   setFigure]   = useState<Plotly.Data[] | null>(null);
  const [caption,  setCaption]  = useState("");

  useEffect(() => { api.allProfiles().then(setAllProfiles).catch(() => {}); }, []);

  const paOpts = useMemo(() => {
    const raw   = new Set(allProfiles.map((p) => p.PerformanceArea));
    const hasBigf = [...raw].some((a) => _BIGF4.has(a));
    const avail = new Set([...raw].filter((a) => !_BIGF4.has(a)));
    if (hasBigf) avail.add("BIGF Bioreactors");
    return _PA_ORDER.filter((a) => avail.has(a));
  }, [allProfiles]);
  useEffect(() => { if (selArea === "" && paOpts.length > 0) setSelArea(paOpts[0]); }, [paOpts]); // eslint-disable-line

  const areas: string[] = selArea === "BIGF Bioreactors" ? ["BIGF1","BIGF2","BIGF3","BIGF4"] : [selArea];
  const profSub = allProfiles.filter((p) =>
    areas.includes(p.PerformanceArea) && p.DataSource?.toLowerCase().includes("historian")
  );
  const tagOpts: Record<string, string> = {};
  for (const p of profSub) {
    const base = p.Unit ? `${p.Description} [${p.Unit}]` : p.Description;
    tagOpts[base] = p.Tag;
  }
  const labels = Object.keys(tagOpts);

  const scatterShouldLoad = useRef(false);
  useEffect(() => {
    if (labels.length >= 3) {
      setXLbl(labels[0] ?? "");
      setYLbl(labels[1] ?? "");
      setZLbl(labels[2] ?? "");
      scatterShouldLoad.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selArea, labels.length]);

  // Fire only after xLbl/yLbl/zLbl state has settled
  const scatterAutoLoadRef = useRef(false);
  useEffect(() => {
    if (!scatterShouldLoad.current || !xLbl || !yLbl || !zLbl || scatterAutoLoadRef.current) return;
    scatterAutoLoadRef.current = true;
    scatterShouldLoad.current = false;
    handleLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xLbl, yLbl, zLbl]);

  async function handleLoad() {
    if (!xLbl || !yLbl || !zLbl) return;
    const tx = tagOpts[xLbl], ty = tagOpts[yLbl], tz = tagOpts[zLbl];
    if (new Set([tx, ty, tz]).size < 3) { alert("Please select 3 different tags."); return; }
    setLoading(true);
    setFigure(null);
    const rows = await api.trends([...new Set([tx, ty, tz])], start, end).catch(() => []);
    const dx = rows.filter((r) => r.Tag === tx).map((r) => ({ t: r.Timestamp_AZ, v: r.Value! }));
    const dy = rows.filter((r) => r.Tag === ty).map((r) => ({ t: r.Timestamp_AZ, v: r.Value! }));
    const dz = rows.filter((r) => r.Tag === tz).map((r) => ({ t: r.Timestamp_AZ, v: r.Value! }));
    const mapY = Object.fromEntries(dy.map((d) => [d.t, d.v]));
    const mapZ = Object.fromEntries(dz.map((d) => [d.t, d.v]));
    const merged = dx.filter((d) => mapY[d.t] !== undefined && mapZ[d.t] !== undefined)
                     .map((d, i, arr) => ({
                       vx: d.v, vy: mapY[d.t], vz: mapZ[d.t],
                       t: d.t,
                       tNum: new Date(d.t).getTime() - new Date(arr[0].t).getTime(),
                     }));
    if (merged.length === 0) { setLoading(false); setCaption("No overlapping timestamps."); return; }
    setFigure([{
      type: "scatter3d",
      x: merged.map((m) => m.vx),
      y: merged.map((m) => m.vy),
      z: merged.map((m) => m.vz),
      mode: "markers",
      marker: { size: 3, color: merged.map((m) => m.tNum), colorscale: "Viridis", opacity: 0.75,
                colorbar: { title: { text: "Time →" }, tickfont: { color: C.MUTED, size: 8 } } },
      text: merged.map((m) => m.t),
      hovertemplate: `<b>${xLbl.slice(0,25)}</b>: %{x:.2f}<br><b>${yLbl.slice(0,25)}</b>: %{y:.2f}<br><b>${zLbl.slice(0,25)}</b>: %{z:.2f}<br>%{text}<extra></extra>`,
    } as Plotly.Data]);
    setCaption(`${merged.length.toLocaleString()} readings · ${start} → ${end}`);
    setLoading(false);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label style={lbl}>Performance Area</label>
          <select value={selArea} onChange={(e) => setSelArea(e.target.value)} style={sel}>
            {paOpts.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <label style={lbl}>Date range</label>
          <div style={{ marginTop: 4 }}>
            <DateRangeBar start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
          </div>
        </div>
        <button onClick={handleLoad} disabled={loading || labels.length < 3} style={btn}>
          {loading ? "Loading…" : "📊 Load Trends"}
        </button>
      </div>

      {labels.length < 3
        ? <div style={{ color: C.MUTED, fontSize: "0.75rem" }}>Need at least 3 historian tags in this area.</div>
        : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {[
              { axis: "X axis", val: xLbl, set: setXLbl },
              { axis: "Y axis", val: yLbl, set: setYLbl },
              { axis: "Z axis", val: zLbl, set: setZLbl },
            ].map(({ axis, val, set }) => (
              <div key={axis} style={{ flex: "1 1 160px" }}>
                <label style={lbl}>{axis}</label>
                <SearchableSelect value={val} options={labels} onChange={set} selStyle={sel} />
              </div>
            ))}
          </div>
        )
      }

      {loading && <Spinner text="Querying sensor data…" />}
      {figure && (
        <>
          <Plot
            data={figure}
            layout={{
              height: 560,
              paper_bgcolor: C.BG,
              scene: {
                bgcolor: "#0b1120",
                xaxis: { title: { text: xLbl.slice(0, 30) }, gridcolor: C.BORDER, color: C.MUTED },
                yaxis: { title: { text: yLbl.slice(0, 30) }, gridcolor: C.BORDER, color: C.MUTED },
                zaxis: { title: { text: zLbl.slice(0, 30) }, gridcolor: C.BORDER, color: C.MUTED },
              },
              margin: { l: 0, r: 0, t: 20, b: 0 },
              font: { color: C.MUTED },
            } as Partial<Plotly.Layout>}
            config={{ displayModeBar: true, responsive: true }}
            useResizeHandler
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: "0.7rem", color: C.MUTED }}>{caption}</div>
        </>
      )}
      {!loading && caption && !figure && (
        <div style={{ color: C.MUTED, fontSize: "0.75rem" }}>{caption}</div>
      )}
    </div>
  );
}


function SurfacePanel({ weekAgo }: { weekAgo: Date }) {
  const { C, theme } = useTheme();
  const { lbl, sel, dtInp, btn } = mkStyles(C, theme);
  const [allProfiles, setAllProfiles] = useState<TagProfile[]>([]);
  const [selArea,   setSelArea]   = useState("");
  const [start,     setStart]     = useState(isoDate(weekAgo));
  const [end,       setEnd]       = useState(isoDate(new Date(weekAgo.getTime() + 3 * 86400000)));
  const [selLabels,    setSelLabels]    = useState<string[]>([]);
  const [sensorSearch, setSensorSearch] = useState("");
  const [loading,      setLoading]      = useState(false);
  const [figure,    setFigure]    = useState<Plotly.Data[] | null>(null);
  const [caption,   setCaption]   = useState("");

  useEffect(() => { api.allProfiles().then(setAllProfiles).catch(() => {}); }, []);

  const paOpts = useMemo(() => {
    const raw   = new Set(allProfiles.map((p) => p.PerformanceArea));
    const hasBigf = [...raw].some((a) => _BIGF4.has(a));
    const avail = new Set([...raw].filter((a) => !_BIGF4.has(a)));
    if (hasBigf) avail.add("BIGF Bioreactors");
    return _PA_ORDER.filter((a) => avail.has(a));
  }, [allProfiles]);
  useEffect(() => { if (selArea === "" && paOpts.length > 0) setSelArea(paOpts[0]); }, [paOpts]); // eslint-disable-line

  const areas: string[] = selArea === "BIGF Bioreactors" ? ["BIGF1","BIGF2","BIGF3","BIGF4"] : [selArea];
  const profSub = allProfiles.filter((p) =>
    areas.includes(p.PerformanceArea) &&
    p.DataSource?.toLowerCase().includes("historian") &&
    !p.IsCalculated
  );
  const tagOpts: Record<string, string> = {};
  for (const p of profSub) {
    const base = p.Unit ? `${p.Description} [${p.Unit}]` : p.Description;
    tagOpts[base] = p.Tag;
  }
  const allLabels = Object.keys(tagOpts);

  // Auto-select all sensors when area changes
  useEffect(() => { setSensorSearch(""); }, [selArea]); // eslint-disable-line
  const surfaceAutoSelectRef = useRef(false);
  useEffect(() => {
    if (allLabels.length === 0) return;
    if (!surfaceAutoSelectRef.current) {
      surfaceAutoSelectRef.current = true;
      setSelLabels(allLabels);
    } else {
      setSelLabels(allLabels); // re-select all on area change
    }
  }, [allLabels.join(",")]); // eslint-disable-line

  // Auto-load once sensors are selected
  const surfaceLoadRef = useRef(false);
  useEffect(() => {
    if (surfaceLoadRef.current || selLabels.length < 2) return;
    surfaceLoadRef.current = true;
    setTimeout(() => handleLoad(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selLabels.length]);

  async function handleLoad() {
    if (selLabels.length < 2) { alert("Select at least 2 sensors."); return; }
    const tags = selLabels.map((l) => tagOpts[l]).filter(Boolean);
    setLoading(true); setFigure(null);
    const rows = await api.trends(tags, start, end).catch(() => [] as TrendPoint[]);
    if (rows.length === 0) { setLoading(false); setCaption("No data for selected range."); return; }

    const tsSet = new Set(rows.map((r) => r.Timestamp_AZ));
    const tsSorted = [...tsSet].sort();
    const step = Math.max(1, Math.floor(tsSorted.length / 300));
    const tsSampled = tsSorted.filter((_, i) => i % step === 0);

    const zRaw: number[][] = tags.map((tag) => {
      const byTs = Object.fromEntries(rows.filter((r) => r.Tag === tag).map((r) => [r.Timestamp_AZ, r.Value]));
      return tsSampled.map((ts) => byTs[ts] ?? null as unknown as number);
    });

    const zNorm = zRaw.map((row) => {
      const valid = row.filter((v) => v !== null && !isNaN(v));
      const mn = Math.min(...valid); const mx = Math.max(...valid);
      if (mx === mn) return row.map(() => 0);
      return row.map((v) => (v === null || isNaN(v)) ? 0 : (v - mn) / (mx - mn));
    });

    const tagLabels = tags.map((t) => {
      const match = Object.entries(tagOpts).find(([, v]) => v === t);
      return (match?.[0] ?? t).slice(0, 28);
    });

    setFigure([{
      type: "surface",
      z: zNorm,
      x: tsSampled.map((_, i) => i),
      y: tagLabels.map((_, i) => i),
      colorscale: "Plasma",
      opacity: 0.88,
      hovertemplate: "Sensor: %{y}<br>Time idx: %{x}<br>Norm: %{z:.3f}<extra></extra>",
    } as unknown as Plotly.Data]);
    setCaption(`Values normalised 0–1 per sensor. ${tsSampled.length} time points · ${start} → ${end}`);
    setLoading(false);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label style={lbl}>Performance Area</label>
          <select value={selArea} onChange={(e) => setSelArea(e.target.value)} style={sel}>
            {paOpts.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <label style={lbl}>Date range</label>
          <div style={{ marginTop: 4 }}>
            <DateRangeBar start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
          </div>
        </div>
        <button onClick={handleLoad} disabled={loading || selLabels.length < 2}
                style={{ ...btn, opacity: selLabels.length < 2 ? 0.45 : 1 }}>
          {loading ? "Loading…" : `📊 Load Trends (${selLabels.length})`}
        </button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 6, padding: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: "0.7rem", color: C.MUTED }}>
              Sensors (2–8 recommended) · {selLabels.length} selected
            </span>
            {selLabels.length > 0 && (
              <button onClick={() => setSelLabels([])} style={{ ...btn, padding: "2px 8px", fontSize: "0.65rem" }}>
                Clear all
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="Search sensors…"
            value={sensorSearch}
            onChange={(e) => setSensorSearch(e.target.value)}
            style={{ ...dtInp, width: "100%", boxSizing: "border-box", marginBottom: 6 }}
          />
          <div style={{ maxHeight: 220, overflowY: "auto", fontSize: "0.72rem" }}>
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
      </div>

      {loading && <Spinner text="Querying sensor data…" />}
      {figure && (
        <>
          <Plot
            data={figure}
            layout={{
              height: 580,
              paper_bgcolor: C.BG,
              scene: {
                bgcolor: "#0b1120",
                xaxis: { title: { text: "Time →" }, gridcolor: C.BORDER, color: C.MUTED },
                yaxis: { title: { text: "Sensor" }, gridcolor: C.BORDER, color: C.MUTED },
                zaxis: { title: { text: "Normalised Value (0–1)" }, gridcolor: C.BORDER, color: C.MUTED },
              },
              margin: { l: 0, r: 0, t: 20, b: 0 },
              font: { color: C.MUTED },
            } as Partial<Plotly.Layout>}
            config={{ displayModeBar: true, responsive: true }}
            useResizeHandler
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: "0.7rem", color: C.MUTED }}>{caption}</div>
        </>
      )}
      {!loading && caption && !figure && (
        <div style={{ color: C.MUTED, fontSize: "0.75rem" }}>{caption}</div>
      )}
    </div>
  );
}


// ─── Leach Pad Map ────────────────────────────────────────────────────────────

const PAD_AREAS = ["Leaching", "Stacking"] as const;
type PadArea = (typeof PAD_AREAS)[number];

const PAD_COLORSCALE: [number, string][] = [
  [0,    "#0a2e0a"],
  [0.2,  "#1a5c2a"],
  [0.4,  "#6b8c2a"],
  [0.6,  "#b87c20"],
  [0.8,  "#a04010"],
  [1,    "#7a1a08"],
];

function LeachPadPanel({ weekAgo, today }: { weekAgo: Date; today: Date }) {
  const { C, theme } = useTheme();
  const { lbl, sel, btn } = mkStyles(C, theme);

  const [allProfiles, setAllProfiles] = useState<TagProfile[]>([]);
  const [area,    setArea]    = useState<PadArea>("Leaching");
  const [start,   setStart]   = useState(isoDate(weekAgo));
  const [end,     setEnd]     = useState(isoDate(today));
  const [loading, setLoading] = useState(false);
  const [figure,  setFigure]  = useState<Plotly.Data[] | null>(null);
  const [caption, setCaption] = useState("");

  useEffect(() => { api.allProfiles().then(setAllProfiles).catch(() => {}); }, []);

  const profiles = allProfiles.filter((p) =>
    p.PerformanceArea === area &&
    p.DataSource?.toLowerCase().includes("historian") &&
    !p.IsCalculated,
  );

  const padAutoLoadRef = useRef(false);
  useEffect(() => {
    if (padAutoLoadRef.current || profiles.length === 0) return;
    padAutoLoadRef.current = true;
    handleLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles.length]);

  async function handleLoad() {
    if (profiles.length === 0) return;
    setLoading(true);
    setFigure(null);

    const tags = profiles.map((p) => p.Tag);
    const rows = await api.trends(tags, start, end).catch(() => [] as TrendPoint[]);

    const stats: Record<string, { sum: number; n: number }> = {};
    for (const r of rows) {
      if (r.Value === null || isNaN(r.Value)) continue;
      if (!stats[r.Tag]) stats[r.Tag] = { sum: 0, n: 0 };
      stats[r.Tag].sum += r.Value;
      stats[r.Tag].n++;
    }

    const active = profiles.filter((p) => (stats[p.Tag]?.n ?? 0) > 0);
    if (active.length === 0) {
      setLoading(false);
      setCaption("No data for selected range.");
      return;
    }

    const nCols = Math.ceil(Math.sqrt(active.length * 1.6));
    const nRows = Math.ceil(active.length / nCols);

    const rawVals = active.map((p) => stats[p.Tag].sum / stats[p.Tag].n);
    const minV = Math.min(...rawVals);
    const maxV = Math.max(...rawVals);
    const span = maxV === minV ? 1 : maxV - minV;

    const Z: number[][] = [];
    const hoverText: string[][] = [];

    for (let r = 0; r < nRows; r++) {
      const zRow: number[] = [];
      const tRow: string[] = [];
      for (let c = 0; c < nCols; c++) {
        const idx = r * nCols + c;
        if (idx < active.length) {
          const p = active[idx];
          const v = stats[p.Tag].sum / stats[p.Tag].n;
          zRow.push((v - minV) / span);
          const unitStr = p.Unit ? ` [${p.Unit}]` : "";
          tRow.push(`<b>${p.Description}${unitStr}</b><br>Avg: ${v.toFixed(3)}<br>Tag: ${p.Tag}`);
        } else {
          zRow.push(0);
          tRow.push("");
        }
      }
      Z.push(zRow);
      hoverText.push(tRow);
    }

    setFigure([{
      type: "surface", z: Z, colorscale: PAD_COLORSCALE, opacity: 0.94,
      text: hoverText, hovertemplate: "%{text}<extra></extra>",
      showscale: true,
      colorbar: { title: { text: "Norm.<br>Value", font: { color: C.MUTED, size: 9 } }, tickfont: { color: C.MUTED, size: 8 }, len: 0.55, thickness: 12 },
      contours: { z: { show: true, usecolormap: true, highlightcolor: "#fff", project: { z: false } } },
    } as unknown as Plotly.Data]);
    setCaption(`${active.length} ${area} sensors · period avg · ${start} → ${end} · Drag to rotate · Scroll to zoom`);
    setLoading(false);
  }

  return (
    <div>
      <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: "0.74rem", color: C.MUTED }}>
        <strong style={{ color: C.TEXT }}>Leach Pad Map</strong> — 3D aerial view of pad sensor readings.
        Each cell is one historian sensor, coloured by its period average (dark green = low, dark red = high).
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <label style={lbl}>Area</label>
          <select value={area} onChange={(e) => setArea(e.target.value as PadArea)} style={{ ...sel, marginTop: 0 }}>
            {PAD_AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 2 }}>
          <label style={lbl}>Date range</label>
          <DateRangeBar start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />
        </div>
        <button onClick={handleLoad} disabled={loading || profiles.length === 0}
                style={{ ...btn, opacity: profiles.length === 0 ? 0.45 : 1 }}>
          {loading ? "Rendering…" : `Render Pad Map (${profiles.length} sensors)`}
        </button>
      </div>

      {loading && <Spinner text="Computing pad sensor averages…" />}

      {figure && (
        <>
          <Plot
            data={figure}
            layout={{
              height: 600, paper_bgcolor: C.BG,
              scene: {
                bgcolor: "#060e06",
                xaxis: { title: { text: "Pad Column →" }, gridcolor: "#1a2a1a", color: C.MUTED },
                yaxis: { title: { text: "Pad Row →"    }, gridcolor: "#1a2a1a", color: C.MUTED },
                zaxis: { title: { text: "Rel. Value"   }, gridcolor: "#1a2a1a", color: C.MUTED, range: [0, 1.3] },
                camera: { eye: { x: 1.5, y: -2.0, z: 1.7 }, up: { x: 0, y: 0, z: 1 } },
                aspectmode: "manual", aspectratio: { x: 2.2, y: 1.6, z: 0.55 },
              },
              margin: { l: 0, r: 0, t: 36, b: 0 }, font: { color: C.MUTED },
              title: { text: `${area} — Pad Sensor Map`, font: { color: C.TEXT, size: 13 }, x: 0.5 },
            } as Partial<Plotly.Layout>}
            config={{ displayModeBar: true, responsive: true }}
            useResizeHandler
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: "0.7rem", color: C.MUTED, marginTop: 4 }}>{caption}</div>
        </>
      )}
      {!loading && caption && !figure && (
        <div style={{ color: C.MUTED, fontSize: "0.75rem" }}>{caption}</div>
      )}
    </div>
  );
}

// suppress unused import warning
const _unused = SectionHeader;
