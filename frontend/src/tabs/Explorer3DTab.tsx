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
  "PA-1", "PA-2", "PA-3", "PA-4", "PA-5",
  "PA-6", "PA-7", "Bioreactors", "BIO Skid", "Scale Up",
];
const _BIGF4 = new Set(["BIO-1", "BIO-2", "BIO-3", "BIO-4"]);

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

function ScatterPanel({ weekAgo, today, initialArea, onAreaChange }: { weekAgo: Date; today: Date; initialArea?: string; onAreaChange?: (pa: string) => void }) {
  const { C, theme } = useTheme();
  const { lbl, sel, btn } = mkStyles(C, theme);
  const [allProfiles, setAllProfiles] = useState<TagProfile[]>([]);
  const [selArea,  setSelArea]  = useState(initialArea ?? "");
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
    if (hasBigf) avail.add("Bioreactors");
    return _PA_ORDER.filter((a) => avail.has(a));
  }, [allProfiles]);
  useEffect(() => { if (selArea === "" && paOpts.length > 0) { setSelArea(paOpts[0]); onAreaChange?.(paOpts[0]); } }, [paOpts]); // eslint-disable-line

  const areas: string[] = selArea === "Bioreactors" ? ["BIO-1","BIO-2","BIO-3","BIO-4"] : [selArea];
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
              autosize: true,
              paper_bgcolor: C.BG,
              scene: {
                bgcolor: "#0b1120",
                domain: { x: [0, 1], y: [0, 1] },
                xaxis: { title: { text: xLbl.slice(0, 30) }, gridcolor: C.BORDER, color: C.MUTED },
                yaxis: { title: { text: yLbl.slice(0, 30) }, gridcolor: C.BORDER, color: C.MUTED },
                zaxis: { title: { text: zLbl.slice(0, 30) }, gridcolor: C.BORDER, color: C.MUTED },
                camera: { eye: { x: 1.5, y: 1.5, z: 1.2 } },
                aspectmode: "auto",
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



export function Explorer3DTab({ initialArea, onAreaChange }: { initialArea?: string; onAreaChange?: (pa: string) => void } = {}) {
  const today   = new Date();
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  return <ScatterPanel weekAgo={weekAgo} today={today} initialArea={initialArea} onAreaChange={onAreaChange} />;
}
