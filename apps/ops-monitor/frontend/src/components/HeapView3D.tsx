import { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { useTheme } from "../theme";
import { getMaterialColors, MATERIAL_LEGEND } from "../constants";
import type { StackingMap, StackingRow } from "../types";

// Cuboid triangulation (8 vertices ordered lo/hi per axis → 12 triangles).
const BOX_I = [0, 0, 4, 4, 0, 0, 3, 3, 0, 0, 1, 1];
const BOX_J = [1, 2, 5, 6, 1, 5, 2, 6, 3, 7, 2, 6];
const BOX_K = [2, 3, 6, 7, 5, 4, 6, 7, 7, 4, 6, 5];

const CELL = 1;      // cell footprint
const GAP  = 0.16;   // gap between cells
const LIFT = 0.28;   // height of one panel/lift (kept low → reads as a flat pad)

type ColourBy = "material" | "progress";

interface MeshGroup {
  color: string; opacity: number;
  x: number[]; y: number[]; z: number[]; i: number[]; j: number[]; k: number[]; n: number;
}

function parseCell(cell: string): { row: number; col: string } {
  const m = /^(\d+)\s*([A-Za-z]+)$/.exec(cell.trim());
  if (m) return { row: parseInt(m[1], 10), col: m[2].toUpperCase() };
  return { row: 0, col: cell };
}

export function HeapView3D({ data, panels, cells }: { data: StackingMap; panels: number[]; cells: string[] }) {
  const { C, theme } = useTheme();
  const [colourBy, setColourBy] = useState<ColourBy>("material");
  const [selected, setSelected] = useState<string | null>(null);

  const statusColour = (s: StackingRow["status"]) =>
    s === "Complete" ? C.OK : s === "In Progress" ? C.ACCENT : C.MUTED;

  // Grid geometry shared by the 3D scene and the mini-map picker.
  const grid = useMemo(() => {
    const rowVals = [...new Set(cells.map((c) => parseCell(c).row))].sort((a, b) => a - b);
    const colVals = [...new Set(cells.map((c) => parseCell(c).col))].sort();
    const cellAt = new Map<string, string>();
    for (const c of cells) { const { row, col } = parseCell(c); cellAt.set(`${row}|${col}`, c); }
    return { rowVals, colVals, cellAt };
  }, [cells]);

  const built = useMemo(() => {
    const palette = getMaterialColors(theme);
    const { rowVals, colVals } = grid;
    const layerOf = new Map(panels.slice().sort((a, b) => a - b).map((p, i) => [p, i]));
    const pitch = CELL + GAP;

    const groups: Record<string, MeshGroup> = {};
    const addBox = (key: string, color: string, opacity: number, x0: number, y0: number, z0: number) => {
      let g = groups[key];
      if (!g) { g = { color, opacity, x: [], y: [], z: [], i: [], j: [], k: [], n: 0 }; groups[key] = g; }
      const x1 = x0 + CELL, y1 = y0 + CELL, z1 = z0 + LIFT;
      const base = g.n * 8;
      g.x.push(x0, x1, x1, x0, x0, x1, x1, x0);
      g.y.push(y0, y0, y1, y1, y0, y0, y1, y1);
      g.z.push(z0, z0, z0, z0, z1, z1, z1, z1);
      for (let t = 0; t < 12; t++) { g.i.push(base + BOX_I[t]); g.j.push(base + BOX_J[t]); g.k.push(base + BOX_K[t]); }
      g.n++;
    };

    const mk = { x: [] as number[], y: [] as number[], z: [] as number[], text: [] as string[], cd: [] as string[][] };
    const edge = { x: [] as (number | null)[], y: [] as (number | null)[], z: [] as (number | null)[] };   // in-progress outline
    const grln = { x: [] as (number | null)[], y: [] as (number | null)[], z: [] as (number | null)[] };   // ground footprint grid

    for (const cell of cells) {
      const { row, col } = parseCell(cell);
      const cx0 = colVals.indexOf(col) * pitch;
      const cy0 = rowVals.indexOf(row) * pitch;
      const cellRows = Object.values(data[cell] ?? {});
      let maxLayer = 0, anyInProgress = false;

      // Ground footprint outline for every cell (draws the pad grid).
      grln.x.push(cx0, cx0 + CELL, cx0 + CELL, cx0, cx0, null);
      grln.y.push(cy0, cy0, cy0 + CELL, cy0 + CELL, cy0, null);
      grln.z.push(0, 0, 0, 0, 0, null);

      for (const p of panels) {
        const r = data[cell]?.[p];
        if (!r) continue;
        const layer = layerOf.get(p) ?? 0;
        maxLayer = Math.max(maxLayer, layer);
        const faint = r.status === "Not Started";
        if (r.status === "In Progress") anyInProgress = true;
        const color = colourBy === "material" ? (palette[r.material]?.bg ?? C.CARD2) : statusColour(r.status);
        const opacity = faint ? 0.22 : 1;
        addBox(`${color}|${faint ? 0 : 1}`, color, opacity, cx0, cy0, layer * LIFT);
      }

      const zTop = (maxLayer + 1) * LIFT + 0.14;
      const cxc = cx0 + CELL / 2, cyc = cy0 + CELL / 2;
      const planned = cellRows.reduce((s, r) => s + (r.tons_planned ?? 0), 0);
      const actual  = cellRows.reduce((s, r) => s + (r.actual_tons ?? 0), 0);
      const pct     = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
      const nDone   = cellRows.filter((r) => r.status === "Complete").length;
      const overall = cellRows.every((r) => r.status === "Complete") ? "Complete"
        : cellRows.some((r) => r.status === "In Progress") ? "In Progress" : "Not Started";
      mk.x.push(cxc); mk.y.push(cyc); mk.z.push(zTop); mk.text.push(cell);
      mk.cd.push([cell, overall, `${nDone}/${cellRows.length}`, planned.toLocaleString(), actual.toLocaleString(), `${pct}`]);

      if (anyInProgress) {
        const zt = (maxLayer + 1) * LIFT;
        edge.x.push(cx0, cx0 + CELL, cx0 + CELL, cx0, cx0, null);
        edge.y.push(cy0, cy0, cy0 + CELL, cy0 + CELL, cy0, null);
        edge.z.push(zt, zt, zt, zt, zt, null);
      }
    }

    const xMax = colVals.length * pitch - GAP;
    const yMax = rowVals.length * pitch - GAP;
    return { groups: Object.values(groups), mk, edge, grln, xMax, yMax };
  }, [data, panels, cells, colourBy, theme, C, grid]);

  const traces: Plotly.Data[] = [];

  // Faint ground plane under the pad.
  traces.push({
    type: "mesh3d",
    x: [-GAP, built.xMax, built.xMax, -GAP],
    y: [-GAP, -GAP, built.yMax, built.yMax],
    z: [-0.03, -0.03, -0.03, -0.03],
    i: [0, 0], j: [1, 2], k: [2, 3],
    color: theme === "dark" ? "#141c2e" : "#dfe6ef", opacity: 0.6,
    hoverinfo: "skip", showscale: false,
  } as unknown as Plotly.Data);

  // Ground footprint grid.
  traces.push({
    type: "scatter3d", mode: "lines",
    x: built.grln.x, y: built.grln.y, z: built.grln.z,
    line: { color: C.BORDER, width: 2 }, hoverinfo: "skip", showlegend: false,
  } as Plotly.Data);

  // Solid + ghost material meshes.
  for (const g of built.groups) {
    traces.push({
      type: "mesh3d", x: g.x, y: g.y, z: g.z, i: g.i, j: g.j, k: g.k,
      color: g.color, opacity: g.opacity, flatshading: true,
      hoverinfo: "skip", showscale: false,
    } as unknown as Plotly.Data);
  }

  // Active-front outline for In-Progress cells.
  if (built.edge.x.length) {
    traces.push({
      type: "scatter3d", mode: "lines",
      x: built.edge.x, y: built.edge.y, z: built.edge.z,
      line: { color: C.ACCENT, width: 5 }, hoverinfo: "skip", showlegend: false,
    } as Plotly.Data);
  }

  // Cell markers + labels (hover + best-effort click).
  traces.push({
    type: "scatter3d", mode: "text+markers",
    x: built.mk.x, y: built.mk.y, z: built.mk.z,
    text: built.mk.text, textposition: "top center",
    textfont: { color: C.TEXT, size: 10 },
    marker: { size: 8, color: C.ACCENT, opacity: 0.9, symbol: "circle" },
    customdata: built.mk.cd,
    hovertemplate:
      "<b>Cell %{customdata[0]}</b><br>Status: %{customdata[1]}<br>" +
      "Panels done: %{customdata[2]}<br>Planned: %{customdata[3]} u<br>" +
      "Stacked: %{customdata[4]} u<br>%{customdata[5]}% complete<extra></extra>",
    showlegend: false,
  } as Plotly.Data);

  const selRows = selected ? Object.values(data[selected] ?? {}).sort((a, b) => a.panel - b.panel) : [];
  const palette = getMaterialColors(theme);
  const cellMatColour = (cell: string) => {
    const rs = Object.values(data[cell] ?? {});
    return palette[rs[0]?.material]?.bg ?? C.CARD2;
  };

  const toggle = (v: ColourBy) => (
    <button onClick={() => setColourBy(v)} style={{
      padding: "3px 12px", fontSize: "0.72rem", cursor: "pointer",
      border: `1px solid ${C.ACCENT}`,
      background: colourBy === v ? C.ACCENT : "transparent",
      color: colourBy === v ? "#fff" : C.TEXT,
      borderRadius: v === "material" ? "4px 0 0 4px" : "0 4px 4px 0",
      fontWeight: colourBy === v ? 700 : 400,
    }}>{v === "material" ? "Material" : "Progress"}</button>
  );

  return (
    <div style={{ background: C.BG, padding: "8px 14px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.72rem", color: C.MUTED }}>Colour by</span>
          <div style={{ display: "flex" }}>{toggle("material")}{toggle("progress")}</div>
        </div>
        {colourBy === "material" ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {MATERIAL_LEGEND.map((m) => (
              <span key={m.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: m.color, border: `1px solid ${C.BORDER}` }} />
                <span style={{ fontSize: "0.72rem", color: C.MUTED }}>{m.label}</span>
              </span>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[["Complete", C.OK], ["In Progress", C.ACCENT], ["Not Started", C.MUTED]].map(([lbl, col]) => (
              <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: col as string }} />
                <span style={{ fontSize: "0.72rem", color: C.MUTED }}>{lbl}</span>
              </span>
            ))}
          </div>
        )}
        <span style={{ fontSize: "0.68rem", color: C.MUTED, marginLeft: "auto" }}>
          Faint blocks = planned, not yet stacked · pick a cell for detail →
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Plot
            data={traces}
            layout={{
              height: 520, autosize: true,
              paper_bgcolor: C.BG,
              scene: {
                bgcolor: theme === "dark" ? "#0b1120" : "#eef2f7",
                xaxis: { visible: false },
                yaxis: { visible: false },
                zaxis: { title: { text: "Lift" }, gridcolor: C.BORDER, color: C.MUTED, showticklabels: false },
                camera: { eye: { x: 1.35, y: 1.35, z: 1.75 } },
                aspectmode: "data",
              },
              margin: { l: 0, r: 0, t: 10, b: 0 },
              showlegend: false,
              font: { color: C.MUTED },
            } as Partial<Plotly.Layout>}
            config={{ displayModeBar: true, responsive: true, displaylogo: false }}
            useResizeHandler
            style={{ width: "100%" }}
            onClick={(e) => {
              const pt = e.points?.[0] as unknown as { customdata?: string[] };
              if (pt?.customdata) setSelected(pt.customdata[0]);
            }}
          />
        </div>

        {/* Cell detail + reliable picker */}
        <div style={{ width: 250, flexShrink: 0, border: `1px solid ${C.BORDER}`, borderRadius: 8, background: C.CARD, padding: "10px 12px", overflowY: "auto", maxHeight: 520 }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: C.TEXT, marginBottom: 8 }}>
            {selected ? `Cell ${selected}` : "Cell Detail"}
          </div>

          {/* Mini pad picker */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {grid.rowVals.map((r) => (
              <div key={r} style={{ display: "flex", gap: 4 }}>
                {grid.colVals.map((c) => {
                  const cell = grid.cellAt.get(`${r}|${c}`);
                  if (!cell) return <div key={c} style={{ flex: 1 }} />;
                  const sel = selected === cell;
                  return (
                    <button key={c} onClick={() => setSelected(cell)} title={cell} style={{
                      flex: 1, padding: "5px 0", fontSize: "0.62rem", cursor: "pointer",
                      borderRadius: 3, color: C.TEXT,
                      background: cellMatColour(cell) + (sel ? "" : "cc"),
                      border: `2px solid ${sel ? C.ACCENT : C.BORDER}`,
                      fontWeight: sel ? 700 : 500,
                    }}>{cell}</button>
                  );
                })}
              </div>
            ))}
          </div>

          {!selected ? (
            <div style={{ fontSize: "0.72rem", color: C.MUTED }}>Pick a cell above (or click it in the 3D heap).</div>
          ) : selRows.length === 0 ? (
            <div style={{ fontSize: "0.72rem", color: C.MUTED }}>No panels for this cell.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
              <thead>
                <tr style={{ color: C.MUTED, textAlign: "left" }}>
                  {["Lift", "Material", "Status", "%"].map((h) => (
                    <th key={h} style={{ padding: "3px 4px", fontWeight: 600, borderBottom: `1px solid ${C.BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selRows.map((r) => (
                  <tr key={r.panel} style={{ borderBottom: `1px solid ${C.BORDER}33` }}>
                    <td style={{ padding: "3px 4px", color: C.TEXT }}>{r.panel}</td>
                    <td style={{ padding: "3px 4px", color: C.MUTED }}>{r.material}</td>
                    <td style={{ padding: "3px 4px", color: statusColour(r.status) }}>{r.status}</td>
                    <td style={{ padding: "3px 4px", color: C.TEXT }}>{r.pct_complete == null ? "—" : `${r.pct_complete.toFixed(0)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
