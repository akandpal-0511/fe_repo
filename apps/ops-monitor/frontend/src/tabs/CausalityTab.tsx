import { useState, useCallback, useEffect, useRef } from "react";
import Plot from "react-plotly.js";
import * as d3force from "d3-force";
import { api } from "../api";
import { useTheme } from "../theme";
import { DateRangeBar } from "../components/DateRangeBar";
import { PA_ORDER, paLabel } from "../constants";
import type { HeatmapResponse, NetworkResponse, CausalityNode, CausalityEdge } from "../types";

const PROCESS_ORDER = [...PA_ORDER];

const PA_COLOURS: Record<string, string> = {
  "PA-1":  "#f0883e",
  "PA-2":  "#d29922",
  "PA-3":  "#3fb950",
  "PA-4":  "#58a6ff",
  "PA-5":  "#a371f7",
  "PA-6":  "#79c0ff",
};

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function isoNDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Heatmap chart ─────────────────────────────────────────────────────────────

function HeatmapChart({
  data,
  onCellClick,
}: {
  data: HeatmapResponse;
  onCellClick: (paI: string, paJ: string) => void;
}) {
  const { C } = useTheme();
  const { areas, matrix } = data;
  const labels = areas.map(paLabel);

  const z = areas.map((_, i) =>
    areas.map((_, j) => {
      if (i === j) return null;
      return matrix[i][j]?.corr ?? 0;
    })
  );

  const text = areas.map((_, i) =>
    areas.map((_, j) => {
      if (i === j) return "";
      const cell = matrix[i][j];
      if (!cell) return "No data";
      const dir = cell.lag > 0 ? `→ ${cell.lag}h lag` : cell.lag < 0 ? `← ${-cell.lag}h lag` : "same time";
      return `r=${cell.corr.toFixed(2)}<br>${dir}`;
    })
  );

  return (
    <Plot
      data={[
        {
          type:        "heatmap",
          z,
          x:           areas,
          y:           areas,
          text,
          hovertemplate: "<b>%{y} → %{x}</b><br>%{text}<extra></extra>",
          colorscale:  [
            [0,   "#1c2333"],
            [0.25,"#1f4e79"],
            [0.5, "#2196f3"],
            [0.75,"#90caf9"],
            [1,   "#e3f2fd"],
          ],
          zmin: 0,
          zmax: 1,
          colorbar: {
            title: "Correlation",
            titlefont: { color: C.TEXT },
            tickfont:  { color: C.TEXT },
            bgcolor:   C.CARD,
          },
        } as never,
      ]}
      layout={{
        paper_bgcolor: C.CARD,
        plot_bgcolor:  C.CARD,
        margin:        { t: 20, r: 20, b: 120, l: 160 },
        xaxis: { tickfont: { color: C.TEXT, size: 11 }, tickangle: -35, tickmode: "array", tickvals: areas, ticktext: labels },
        yaxis: { tickfont: { color: C.TEXT, size: 11 }, tickmode: "array", tickvals: areas, ticktext: labels },
        height: 480,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: "100%" }}
      onClick={(e) => {
        const pt = e.points[0];
        if (pt) onCellClick(pt.y as string, pt.x as string);
      }}
    />
  );
}

// ── Force-directed network graph (d3-force + canvas) ─────────────────────────

interface SimNode extends d3force.SimulationNodeDatum {
  id: string; tag: string; description: string; pa: string; colour: string; degree: number;
}
interface SimEdge extends d3force.SimulationLinkDatum<SimNode> {
  corr: number; lag: number; granger_p?: number | null; granger_confirmed?: boolean;
}

function NetworkGraph({ data, grangerRan }: { data: NetworkResponse; grangerRan: boolean }) {
  const { C } = useTheme();
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const simRef     = useRef<d3force.Simulation<SimNode, SimEdge> | null>(null);
  const nodesRef   = useRef<SimNode[]>([]);
  const edgesRef   = useRef<SimEdge[]>([]);
  const dragRef    = useRef<{ node: SimNode; ox: number; oy: number } | null>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const panRef     = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const didMoveRef = useRef(false);

  const [selected, setSelected] = useState<SimNode | null>(null);

  const { nodes, edges } = data;

  // Build sim nodes/edges once data changes
  useEffect(() => {
    nodesRef.current = nodes.map((n) => ({ ...n }));
    const nodeById = new Map(nodesRef.current.map((n) => [n.id, n]));
    edgesRef.current = edges.map((e) => ({
      source: nodeById.get(e.source) ?? e.source,
      target: nodeById.get(e.target) ?? e.target,
      corr: e.corr, lag: e.lag,
      granger_p: e.granger_p, granger_confirmed: e.granger_confirmed,
    }));

    const sim = d3force.forceSimulation<SimNode>(nodesRef.current)
      .force("link", d3force.forceLink<SimNode, SimEdge>(edgesRef.current)
        .id((d) => d.id).distance(160).strength(0.3))
      .force("charge", d3force.forceManyBody().strength(-600))
      .force("collision", d3force.forceCollide().radius(() => 48))
      .force("x", d3force.forceX(0).strength(0.03))
      .force("y", d3force.forceY(0).strength(0.03))
      .on("tick", draw);

    simRef.current = sim;
    setSelected(null);
    return () => { sim.stop(); };
  }, [data]);

  // Redraw when grangerRan changes (edge colours update)
  useEffect(() => { draw(); }, [grangerRan, C]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const { x: tx, y: ty, k } = transformRef.current;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(tx + W / 2, ty + H / 2);
    ctx.scale(k, k);

    // Draw edges — curved to avoid overlap
    edgesRef.current.forEach((e) => {
      const s = e.source as SimNode, t = e.target as SimNode;
      if (s.x == null || t.x == null) return;
      const confirmed = grangerRan && e.granger_confirmed === true;
      const rejected  = grangerRan && e.granger_confirmed === false && e.granger_p != null;
      const baseCol   = e.corr >= 0 ? "#3b82f6" : "#ef4444";
      const colour    = confirmed ? (e.corr >= 0 ? "#22c55e" : "#f97316") : baseCol;
      const alpha     = rejected ? 0.1 : 0.15 + 0.45 * Math.abs(e.corr);
      const lw        = confirmed ? 2 + 1.5 * Math.abs(e.corr) : 0.8 + 1.2 * Math.abs(e.corr);

      const sx = s.x ?? 0, sy = s.y ?? 0, tx2 = t.x ?? 0, ty2 = t.y ?? 0;
      const dx = tx2 - sx, dy = ty2 - sy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      // Curve offset — perpendicular to edge
      const cx = (sx + tx2) / 2 - dy * 0.25;
      const cy = (sy + ty2) / 2 + dx * 0.25;
      const nr = nodeRadius(t);
      // Endpoint on node circumference via tangent of curve
      const tdx = tx2 - cx, tdy = ty2 - cy;
      const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      const ex = tx2 - (tdx / tlen) * nr;
      const ey = ty2 - (tdy / tlen) * nr;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colour;
      ctx.lineWidth   = lw;
      if (rejected) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();

      // Arrowhead
      ctx.setLineDash([]);
      ctx.globalAlpha = Math.min(1, alpha + 0.25);
      const angle = Math.atan2(ey - cy, ex - cx);
      const headLen = 7;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
      ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.restore();
    });

    // Draw nodes
    nodesRef.current.forEach((n) => {
      if (n.x == null || n.y == null) return;
      const r = nodeRadius(n);
      const isSel = selected?.id === n.id;

      // Selection ring
      if (isSel) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = n.colour;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Node fill — small dot style
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.colour + (isSel ? "ff" : "dd");
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // Pill label below node
      const label = n.description.length > 22 ? n.description.slice(0, 21) + "…" : n.description;
      const fontSize = 10;
      ctx.font = `${isSel ? 600 : 400} ${fontSize}px sans-serif`;
      const tw = ctx.measureText(label).width;
      const px = 5, py = 3;
      const lx = n.x - tw / 2 - px;
      const ly = n.y + r + 6;
      // pill background
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = C.CARD;
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw + px * 2, fontSize + py * 2, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      // label text
      ctx.fillStyle = isSel ? n.colour : C.TEXT;
      ctx.fillText(label, n.x, ly + fontSize + py - 1);
    });

    ctx.restore();
  }

  function nodeRadius(n: SimNode) { return 5 + n.degree * 1.2; }

  function toSimCoords(cx: number, cy: number, canvas: HTMLCanvasElement): [number, number] {
    const { x: tx, y: ty, k } = transformRef.current;
    return [(cx - canvas.width / 2 - tx) / k, (cy - canvas.height / 2 - ty) / k];
  }

  function hitNode(sx: number, sy: number): SimNode | null {
    for (const n of nodesRef.current) {
      if (n.x == null || n.y == null) continue;
      const dx = sx - n.x, dy = sy - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= nodeRadius(n) + 4) return n;
    }
    return null;
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const [sx, sy] = toSimCoords(cx, cy, canvas);
    const hit = hitNode(sx, sy);
    didMoveRef.current = false;
    if (hit) {
      dragRef.current = { node: hit, ox: sx - (hit.x ?? 0), oy: sy - (hit.y ?? 0) };
      hit.fx = hit.x; hit.fy = hit.y;
      simRef.current?.alphaTarget(0.1).restart();
    } else {
      panRef.current = { startX: e.clientX, startY: e.clientY, tx: transformRef.current.x, ty: transformRef.current.y };
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const [sx, sy] = toSimCoords(cx, cy, canvas);
    if (dragRef.current) {
      didMoveRef.current = true;
      const { node, ox, oy } = dragRef.current;
      node.fx = sx - ox; node.fy = sy - oy;
      simRef.current?.alphaTarget(0.1).restart();
    } else if (panRef.current) {
      didMoveRef.current = true;
      transformRef.current.x = panRef.current.tx + (e.clientX - panRef.current.startX);
      transformRef.current.y = panRef.current.ty + (e.clientY - panRef.current.startY);
      draw();
    }
    // Cursor hint
    canvas.style.cursor = hitNode(sx, sy) ? "pointer" : panRef.current ? "grabbing" : "grab";
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const [sx, sy] = toSimCoords(cx, cy, canvas);
    const wasDrag = didMoveRef.current;
    didMoveRef.current = false;

    if (dragRef.current) {
      const { node } = dragRef.current;
      node.fx = null; node.fy = null;
      simRef.current?.alphaTarget(0);
      dragRef.current = null;
      // If barely moved, treat as a click
      if (!wasDrag) {
        const hit = hitNode(sx, sy);
        setSelected((prev) => prev?.id === hit?.id ? null : hit);
      }
    } else if (panRef.current) {
      panRef.current = null;
      if (!wasDrag) {
        const hit = hitNode(sx, sy);
        setSelected((prev) => prev?.id === hit?.id ? null : hit);
      }
    }
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    transformRef.current.k = Math.max(0.2, Math.min(4, transformRef.current.k * factor));
    draw();
  }

  // Build side-panel data for selected node
  const selectedLeads  = selected ? edges.filter((e) => e.source === selected.id) : [];
  const selectedLedBy  = selected ? edges.filter((e) => e.target === selected.id) : [];

  if (nodes.length === 0) {
    return (
      <div style={{ padding: 32, color: C.MUTED, textAlign: "center" }}>
        No sensor pairs above the correlation threshold for this PA pair.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", background: C.CARD, borderRadius: 8, overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          width={900} height={560}
          style={{ width: "100%", height: 560, display: "block", cursor: "grab" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
        />
        {/* Legend */}
        <div style={{
          position: "absolute", bottom: 10, left: 10,
          background: C.CARD2 + "ee", border: `1px solid ${C.BORDER}`,
          borderRadius: 6, padding: "6px 10px", fontSize: "0.68rem", color: C.MUTED,
        }}>
          {[...new Set(nodes.map((n) => n.pa))].map((pa) => (
            <div key={pa} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: PA_COLOURS[pa] ?? "#7d8590", display: "inline-block" }} />
              {paLabel(pa)}
            </div>
          ))}
          <div style={{ marginTop: 6, borderTop: `1px solid ${C.BORDER}`, paddingTop: 4 }}>
            <span style={{ color: "#3fb950" }}>━</span> Granger confirmed
            <br /><span style={{ color: "#58a6ff" }}>━</span> Correlation only
            <br /><span style={{ color: C.MUTED }}>╌</span> Granger rejected
          </div>
          <div style={{ marginTop: 4, color: C.MUTED + "99" }}>scroll to zoom · drag to pan · click node</div>
        </div>
      </div>

      {/* Side panel — selected node inspector */}
      <div style={{
        width: 240, flexShrink: 0,
        background: C.CARD, border: `1px solid ${C.BORDER}`,
        borderRadius: 8, padding: "14px 14px",
        minHeight: 200,
      }}>
        {!selected ? (
          <div style={{ color: C.MUTED, fontSize: "0.75rem", textAlign: "center", paddingTop: 40 }}>
            Click a node to<br />inspect its connections
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: selected.colour, marginBottom: 2 }}>
                {selected.description}
              </div>
              <div style={{ fontSize: "0.68rem", color: C.MUTED }}>PA: {selected.pa}</div>
              <div style={{ fontSize: "0.68rem", color: C.MUTED }}>Tag: {selected.tag}</div>
              <div style={{ fontSize: "0.68rem", color: C.MUTED }}>Connections: {selected.degree}</div>
            </div>

            {selectedLeads.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: C.MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>
                  Leads →
                </div>
                {selectedLeads.map((e, i) => {
                  const tgt = nodes.find((n) => n.id === e.target);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 3 }}>
                      <span style={{ color: PA_COLOURS[tgt?.pa ?? ""] ?? C.TEXT, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tgt?.description ?? e.target}
                      </span>
                      <span style={{ color: e.corr >= 0 ? "#58a6ff" : "#f85149", whiteSpace: "nowrap", marginLeft: 4 }}>
                        r={e.corr.toFixed(2)} {e.lag}h
                        {grangerRan && e.granger_confirmed != null && (
                          <span style={{ marginLeft: 3, color: e.granger_confirmed ? "#3fb950" : "#f85149" }}>
                            {e.granger_confirmed ? "✓" : "✗"}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedLedBy.length > 0 && (
              <div>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: C.MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>
                  ← Led by
                </div>
                {selectedLedBy.map((e, i) => {
                  const src = nodes.find((n) => n.id === e.source);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", marginBottom: 3 }}>
                      <span style={{ color: PA_COLOURS[src?.pa ?? ""] ?? C.TEXT, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {src?.description ?? e.source}
                      </span>
                      <span style={{ color: e.corr >= 0 ? "#58a6ff" : "#f85149", whiteSpace: "nowrap", marginLeft: 4 }}>
                        r={e.corr.toFixed(2)} {e.lag}h
                        {grangerRan && e.granger_confirmed != null && (
                          <span style={{ marginLeft: 3, color: e.granger_confirmed ? "#3fb950" : "#f85149" }}>
                            {e.granger_confirmed ? "✓" : "✗"}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ nodes, edges, areas, heatmapMode, maxCorr }: { nodes: number; edges: number; areas: number; heatmapMode?: boolean; maxCorr?: number }) {
  const { C } = useTheme();
  const items = heatmapMode ? [
    { label: "PAs included",        value: String(areas) },
    { label: "PA pairs found",      value: String(nodes) },
    { label: "Max correlation",     value: maxCorr != null ? maxCorr.toFixed(2) : "—" },
    { label: "Above threshold",     value: String(edges) },
  ] : [
    { label: "PAs included",        value: String(areas) },
    { label: "Active sensors",      value: String(nodes) },
    { label: "Causal links",        value: String(edges) },
  ];
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
      {items.map(({ label, value }) => (
        <div key={label} style={{
          background: C.CARD2, border: `1px solid ${C.BORDER}`,
          borderRadius: 6, padding: "6px 14px", minWidth: 100,
        }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: C.ACCENT }}>{value}</div>
          <div style={{ fontSize: "0.72rem", color: C.MUTED }}>{label}</div>
        </div>
      ))}
      {heatmapMode && edges === 0 && nodes > 0 && (
        <div style={{ alignSelf: "center", fontSize: "0.72rem", color: C.WARN, marginLeft: 4 }}>
          ⚠ Data found but all below threshold — try lowering it
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function CausalityTab() {
  const { C } = useTheme();

  const [start, setStart]           = useState(isoNDaysAgo(14));
  const [end,   setEnd]             = useState(isoToday());
  const [maxLag, setMaxLag]         = useState(48);
  const [threshold, setThreshold]   = useState(0.4);
  const [selectedPAs, setSelectedPAs] = useState<Set<string>>(new Set());

  const [view, setView]             = useState<"heatmap" | "network">("heatmap");
  const [heatmap, setHeatmap]       = useState<HeatmapResponse | null>(null);
  const [network, setNetwork]       = useState<NetworkResponse | null>(null);
  const [drillPair, setDrillPair]   = useState<[string, string] | null>(null);
  const [grangerRan, setGrangerRan] = useState(false);
  const [grangerLoading, setGrangerLoading] = useState(false);

  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const togglePA = (pa: string) => {
    setSelectedPAs((prev) => {
      const next = new Set(prev);
      next.has(pa) ? next.delete(pa) : next.add(pa);
      return next;
    });
  };

  const runHeatmap = useCallback(async () => {
    if (selectedPAs.size < 1) { setError("Select at least 1 PA."); return; }
    // Single PA — skip heatmap, go straight to intra-PA sensor network
    if (selectedPAs.size === 1) {
      const [pa] = [...selectedPAs];
      setLoading(true); setError(null); setHeatmap(null); setNetwork(null);
      setDrillPair([pa, pa]); setView("network"); setGrangerRan(false);
      try {
        const result = await api.causalityNetwork({
          areas: [pa], start, end, max_lag_hours: maxLag, threshold,
        });
        setNetwork(result);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true); setError(null); setHeatmap(null); setNetwork(null); setDrillPair(null); setView("heatmap");
    try {
      const result = await api.causalityHeatmap({
        areas: [...selectedPAs], start, end, max_lag_hours: maxLag,
      });
      setHeatmap(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedPAs, start, end, maxLag, threshold]);

  const drillToNetwork = useCallback(async (paI: string, paJ: string) => {
    setLoading(true); setError(null); setNetwork(null); setDrillPair([paI, paJ]);
    setView("network"); setGrangerRan(false);
    try {
      const result = await api.causalityNetwork({
        areas: [paI, paJ], start, end, max_lag_hours: maxLag, threshold,
      });
      setNetwork(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [start, end, maxLag, threshold]);

  const runGranger = useCallback(async () => {
    if (!network || network.edges.length === 0) return;
    setGrangerLoading(true); setError(null);
    try {
      const enrichedEdges = await api.causalityGranger({
        edges: network.edges, start, end, max_lag_hours: maxLag,
      });
      setNetwork({ ...network, edges: enrichedEdges });
      setGrangerRan(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setGrangerLoading(false);
    }
  }, [network, start, end, maxLag]);

  const backToHeatmap = () => {
    setView("heatmap"); setDrillPair(null); setNetwork(null); setGrangerRan(false);
  };

  return (
    <div style={{ fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: C.ACCENT, letterSpacing: 2, textTransform: "uppercase" }}>
          Causality Explorer
        </span>
        <span style={{ fontSize: "0.72rem", color: C.MUTED, marginLeft: 10 }}>
          — discover which sensors drive which across process areas
        </span>
      </div>

      {/* Controls */}
      <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
        {/* PA toggles */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: "0.7rem", color: C.MUTED }}>Process areas to include:</span>
          <span style={{ fontSize: "0.67rem", color: C.MUTED, fontStyle: "italic" }}>
            {selectedPAs.size === 0 && "Select 1 PA for intra-sensor analysis · 2+ for cross-PA heatmap"}
            {selectedPAs.size === 1 && "→ intra-sensor network (sensors within this PA)"}
            {selectedPAs.size >= 2 && "→ cross-PA heatmap"}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {PROCESS_ORDER.map((pa) => {
            const on = selectedPAs.has(pa);
            return (
              <button key={pa} onClick={() => togglePA(pa)} style={{
                background: on ? (PA_COLOURS[pa] + "22") : C.CARD2,
                border:     `1px solid ${on ? PA_COLOURS[pa] : C.BORDER}`,
                color:      on ? PA_COLOURS[pa] : C.MUTED,
                borderRadius: 20, padding: "3px 10px", fontSize: "0.72rem",
                cursor: "pointer", fontWeight: on ? 600 : 400, transition: "all 0.15s",
              }}>
                {paLabel(pa)}
              </button>
            );
          })}
        </div>

        {/* Date + sliders row */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
          <DateRangeBar start={start} end={end} onStartChange={setStart} onEndChange={setEnd} />

          <label style={{ fontSize: "0.72rem", color: C.MUTED, display: "flex", alignItems: "center", gap: 8 }}>
            Max lag
            <input type="range" min={6} max={120} step={6} value={maxLag}
              onChange={(e) => setMaxLag(Number(e.target.value))}
              style={{ width: 80 }} />
            <span style={{ color: C.TEXT, minWidth: 36 }}>{maxLag}h</span>
          </label>

          <label style={{ fontSize: "0.72rem", color: C.MUTED, display: "flex", alignItems: "center", gap: 8 }}>
            Threshold
            <input type="range" min={0.2} max={0.9} step={0.05} value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              style={{ width: 80 }} />
            <span style={{ color: C.TEXT, minWidth: 36 }}>r≥{threshold.toFixed(2)}</span>
          </label>

          <button onClick={runHeatmap} disabled={loading} style={{
            background: C.ACCENT, color: C.BG, border: "none", borderRadius: 6,
            padding: "6px 18px", fontSize: "0.78rem", fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
          }}>
            {loading ? "Computing…" : "Run Analysis"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#2d1b1b", border: "1px solid #f85149", borderRadius: 6, padding: "8px 14px", marginBottom: 12, color: "#f85149", fontSize: "0.78rem" }}>
          {error}
        </div>
      )}

      {/* Network drill-down breadcrumb */}
      {view === "network" && drillPair && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <button onClick={backToHeatmap} style={{
            background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.ACCENT,
            borderRadius: 6, padding: "4px 12px", fontSize: "0.72rem", cursor: "pointer",
          }}>
            ← Back to heatmap
          </button>
          <span style={{ fontSize: "0.78rem", color: C.TEXT }}>
            {drillPair[0] === drillPair[1] ? (
              <>
                <span style={{ color: PA_COLOURS[drillPair[0]] ?? C.MUTED }}>{paLabel(drillPair[0])}</span>
                {" — intra-sensor network"}
              </>
            ) : (
              <>
                <span style={{ color: PA_COLOURS[drillPair[0]] ?? C.MUTED }}>{paLabel(drillPair[0])}</span>
                {" ↔ "}
                <span style={{ color: PA_COLOURS[drillPair[1]] ?? C.MUTED }}>{paLabel(drillPair[1])}</span>
              </>
            )}
            {" (r ≥ "}{threshold.toFixed(2)}{", lag ≤ "}{maxLag}h)
          </span>
        </div>
      )}

      {/* Results */}
      {view === "heatmap" && heatmap && !loading && (
        <>
          <StatsBar
            heatmapMode
            areas={heatmap.areas.length}
            nodes={heatmap.matrix.flat().filter((c) => c !== null).length}
            edges={heatmap.matrix.flat().filter((c) => c !== null && Math.abs(c.corr) >= threshold).length}
            maxCorr={Math.max(0, ...heatmap.matrix.flat().filter((c) => c !== null).map((c) => Math.abs(c!.corr)))}
          />
          <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
            <div style={{ fontSize: "0.7rem", color: C.MUTED, marginBottom: 6 }}>
              Click any cell to drill into the sensor network for that PA pair
            </div>
            <HeatmapChart data={heatmap} onCellClick={drillToNetwork} />
          </div>
        </>
      )}

      {view === "network" && network && !loading && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <StatsBar areas={drillPair ? 2 : 0} nodes={network.nodes.length} edges={network.edges.length} />
            {!grangerRan ? (
              <button onClick={runGranger} disabled={grangerLoading || network.edges.length === 0} style={{
                background: "#3fb95022", border: "1px solid #3fb950", color: "#3fb950",
                borderRadius: 6, padding: "6px 16px", fontSize: "0.78rem", fontWeight: 700,
                cursor: grangerLoading ? "not-allowed" : "pointer", opacity: grangerLoading ? 0.6 : 1,
                alignSelf: "flex-start", marginTop: 2,
              }}>
                {grangerLoading ? "Running Granger…" : "⚗ Run Granger Test"}
              </button>
            ) : (
              <div style={{ fontSize: "0.72rem", color: C.MUTED, alignSelf: "flex-start", marginTop: 8 }}>
                <span style={{ color: "#3fb950", fontWeight: 700 }}>●</span> Green = Granger confirmed (p&lt;0.05)
                {"  "}
                <span style={{ color: "#58a6ff", fontWeight: 700 }}>●</span> Blue/red = correlation only
                {"  "}
                <span style={{ color: C.MUTED }}>·····</span> Granger rejected
              </div>
            )}
          </div>
          <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "10px 14px" }}>
            <NetworkGraph data={network} grangerRan={grangerRan} />
          </div>
          {network.edges.length > 0 && (
            <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "10px 14px", marginTop: 10 }}>
              <div style={{ fontSize: "0.7rem", color: C.MUTED, marginBottom: 8 }}>Top causal links (by |r|)</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                <thead>
                  <tr style={{ color: C.MUTED, textAlign: "left" }}>
                    {["Source sensor", "Target sensor", "Correlation", "Lag (hours)", ...(grangerRan ? ["Granger p", "Verdict"] : [])].map((h) => (
                      <th key={h} style={{ padding: "4px 10px", borderBottom: `1px solid ${C.BORDER}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...network.edges]
                    .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr))
                    .slice(0, 15)
                    .map((e, i) => {
                      const src = network.nodes.find((n) => n.id === e.source);
                      const tgt = network.nodes.find((n) => n.id === e.target);
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.BORDER}22` }}>
                          <td style={{ padding: "5px 10px", color: PA_COLOURS[src?.pa ?? ""] ?? C.TEXT }}>
                            {src?.description ?? e.source}
                          </td>
                          <td style={{ padding: "5px 10px", color: PA_COLOURS[tgt?.pa ?? ""] ?? C.TEXT }}>
                            {tgt?.description ?? e.target}
                          </td>
                          <td style={{ padding: "5px 10px", color: e.corr >= 0 ? "#58a6ff" : "#f85149", fontWeight: 600 }}>
                            {e.corr.toFixed(3)}
                          </td>
                          <td style={{ padding: "5px 10px", color: C.TEXT }}>
                            {e.lag}h
                          </td>
                          {grangerRan && (
                            <>
                              <td style={{ padding: "5px 10px", color: C.MUTED }}>
                                {e.granger_p !== null && e.granger_p !== undefined ? e.granger_p.toFixed(3) : "—"}
                              </td>
                              <td style={{ padding: "5px 10px", fontWeight: 700,
                                color: e.granger_confirmed ? "#3fb950" : e.granger_p !== null && e.granger_p !== undefined ? "#f85149" : C.MUTED }}>
                                {e.granger_confirmed ? "✓ Confirmed" : e.granger_p !== null && e.granger_p !== undefined ? "✗ Rejected" : "Insufficient data"}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!heatmap && !loading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* How it works — 3 steps */}
          <div style={{
            background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8,
            padding: "18px 20px",
          }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: C.MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
              How it works
            </div>
            <div style={{ display: "flex", gap: 0 }}>
              {[
                {
                  step: "1",
                  icon: "⚙️",
                  title: "Configure",
                  body: "Pick the process areas you want to compare, set a date range, and tune the max lag and correlation threshold above.",
                },
                {
                  step: "2",
                  icon: "🔥",
                  title: "Run Heatmap",
                  body: "Click Run Analysis. Each cell shows the peak cross-correlation between any two PA sensor pairs — brighter = stronger link.",
                },
                {
                  step: "3",
                  icon: "🕸️",
                  title: "Drill into sensors",
                  body: "Click any heatmap cell to see the sensor-level network for that PA pair. Arrows show direction; lag shows how many hours one PA leads the other.",
                },
                {
                  step: "4",
                  icon: "⚗️",
                  title: "Granger test",
                  body: "In the network view, click Run Granger Test to statistically confirm which links are truly causal (p < 0.05) vs coincidental correlation.",
                },
              ].map(({ step, icon, title, body }, i, arr) => (
                <div key={step} style={{ display: "flex", flex: 1 }}>
                  <div style={{
                    flex: 1, padding: "0 16px",
                    borderRight: i < arr.length - 1 ? `1px solid ${C.BORDER}` : "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{
                        background: C.ACCENT + "22", border: `1px solid ${C.ACCENT}`,
                        color: C.ACCENT, borderRadius: "50%",
                        width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.65rem", fontWeight: 700, flexShrink: 0,
                      }}>{step}</span>
                      <span style={{ fontSize: "0.8rem" }}>{icon}</span>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: C.TEXT }}>{title}</span>
                    </div>
                    <p style={{ fontSize: "0.72rem", color: C.MUTED, margin: 0, lineHeight: 1.55 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What the outputs mean */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12,
          }}>
            {[
              {
                label: "Correlation (r)",
                colour: "#58a6ff",
                rows: [
                  { val: "r ≥ 0.8", desc: "Strong link — one PA very likely influences the other" },
                  { val: "r 0.5–0.8", desc: "Moderate link — worth investigating" },
                  { val: "r < 0.5", desc: "Weak / noise — filtered out by threshold" },
                ],
              },
              {
                label: "Lag (hours)",
                colour: "#a371f7",
                rows: [
                  { val: "Low lag (1–6h)", desc: "Near-immediate effect — possibly same process step" },
                  { val: "Med lag (6–24h)", desc: "Upstream PA change takes hours to propagate downstream" },
                  { val: "High lag (24h+)", desc: "Slow physical process (e.g. a gradual chemistry or temperature shift)" },
                ],
              },
              {
                label: "Granger test",
                colour: "#3fb950",
                rows: [
                  { val: "✓ p < 0.05", desc: "Statistically confirmed — past values of A predict B" },
                  { val: "✗ p ≥ 0.05", desc: "Correlation only — may be coincidence or common driver" },
                  { val: "— No data", desc: "Insufficient overlap to run the test at this lag" },
                ],
              },
            ].map(({ label, colour, rows }) => (
              <div key={label} style={{
                background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "14px 16px",
              }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, color: colour, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                  {label}
                </div>
                {rows.map(({ val, desc }) => (
                  <div key={val} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ fontSize: "0.72rem", color: colour, fontWeight: 600, whiteSpace: "nowrap", minWidth: 90 }}>{val}</span>
                    <span style={{ fontSize: "0.72rem", color: C.MUTED, lineHeight: 1.4 }}>{desc}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
