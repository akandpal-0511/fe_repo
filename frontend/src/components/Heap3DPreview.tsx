/**
 * Lightweight 3D heap preview — heap blocks only, no sensors.
 * Used in the Stacking tab above the table.
 * Works directly from StackingRow[] (no extra API call needed).
 */
import Plot from "react-plotly.js";
import type { StackingRow } from "../types";
import { useTheme } from "../theme";

const CELL_Y: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };
const BOX_H  = 7;
const B_HALF = 0.44;
const T_HALF = 0.28;
const FLAT_H = 0.08;

const MATERIAL_COLORS: Record<string, string> = {
  "Non-core BQ":    "#4a90d9",
  "Non-core blend": "#e08c5c",
  "PV":             "#4caf76",
  "Core edge":      "#ffc107",
  "Core":           "#c0c0c0",
};

const FACE_I = [0,0,4,4,0,0,3,3,0,0,1,1];
const FACE_J = [1,2,5,6,1,5,2,6,3,7,2,6];
const FACE_K = [2,3,6,7,5,4,6,7,7,4,6,5];

function heapHeight(row: StackingRow): number {
  if (row.status === "Not Started") return 0;
  const ratio = Math.min((row.actual_tons ?? 0) / (row.tons_planned ?? 1), 1.0);
  return Math.max(ratio * BOX_H, 0.3);
}

function buildTraces(rows: StackingRow[]): Plotly.Data[] {
  // Deduplicate: keep highest stacking_order per (panel, cell)
  const best = new Map<string, StackingRow>();
  for (const r of rows) {
    const key = `${r.panel}|${r.cell}`;
    const prev = best.get(key);
    if (!prev || r.stacking_order > prev.stacking_order) best.set(key, r);
  }

  const heapWX: (number|null)[] = [], heapWY: (number|null)[] = [], heapWZ: (number|null)[] = [];
  const flatWX: (number|null)[] = [], flatWY: (number|null)[] = [], flatWZ: (number|null)[] = [];
  const byMat = new Map<string, { x: number[]; y: number[]; z: number[]; i: number[]; j: number[]; k: number[] }>();
  const flatGeom = { x: [] as number[], y: [] as number[], z: [] as number[], i: [] as number[], j: [] as number[], k: [] as number[] };

  for (const row of best.values()) {
    const py = CELL_Y[row.cell];
    if (py === undefined) continue;
    const h    = heapHeight(row);
    const flat = h === 0;
    const th   = flat ? B_HALF : T_HALF;
    const boxH = flat ? FLAT_H : h;
    const cx   = row.panel, cy = py;

    const wX = flat ? flatWX : heapWX;
    const wY = flat ? flatWY : heapWY;
    const wZ = flat ? flatWZ : heapWZ;
    const bC: [number,number][] = [[cx-B_HALF,cy-B_HALF],[cx+B_HALF,cy-B_HALF],[cx+B_HALF,cy+B_HALF],[cx-B_HALF,cy+B_HALF],[cx-B_HALF,cy-B_HALF]];
    const tC: [number,number][] = [[cx-th,cy-th],[cx+th,cy-th],[cx+th,cy+th],[cx-th,cy+th],[cx-th,cy-th]];
    for (const [x,y] of bC) { wX.push(x); wY.push(y); wZ.push(0); }    wX.push(null); wY.push(null); wZ.push(null);
    for (const [x,y] of tC) { wX.push(x); wY.push(y); wZ.push(boxH); } wX.push(null); wY.push(null); wZ.push(null);
    for (let vi = 0; vi < 4; vi++) {
      wX.push(bC[vi][0], tC[vi][0], null);
      wY.push(bC[vi][1], tC[vi][1], null);
      wZ.push(0, boxH, null);
    }

    const geom = flat ? flatGeom : (() => {
      const mat = row.material || "Unknown";
      if (!byMat.has(mat)) byMat.set(mat, { x:[],y:[],z:[],i:[],j:[],k:[] });
      return byMat.get(mat)!;
    })();
    const off = geom.x.length;
    geom.x.push(cx-B_HALF, cx+B_HALF, cx+B_HALF, cx-B_HALF, cx-th, cx+th, cx+th, cx-th);
    geom.y.push(cy-B_HALF, cy-B_HALF, cy+B_HALF, cy+B_HALF, cy-th, cy-th, cy+th, cy+th);
    geom.z.push(0,0,0,0, boxH,boxH,boxH,boxH);
    geom.i.push(...FACE_I.map(v => v+off));
    geom.j.push(...FACE_J.map(v => v+off));
    geom.k.push(...FACE_K.map(v => v+off));
  }

  const traces: Plotly.Data[] = [];

  if (flatGeom.x.length > 0) {
    traces.push({ type: "mesh3d", name: "Not started", ...flatGeom, color: "#dce8f5", opacity: 0.45,
      flatshading: true, lighting: { ambient:1, diffuse:0, specular:0, roughness:1, fresnel:0 },
      showscale: false, hoverinfo: "skip", showlegend: true } as unknown as Plotly.Data);
    traces.push({ type: "scatter3d", x: flatWX, y: flatWY, z: flatWZ,
      mode: "lines", line: { color: "rgba(140,170,210,0.25)", width: 1 },
      hoverinfo: "skip", showlegend: false } as Plotly.Data);
  }

  if (heapWX.length > 0) {
    traces.push({ type: "scatter3d", x: heapWX, y: heapWY, z: heapWZ,
      mode: "lines", line: { color: "rgba(160,185,220,0.5)", width: 1 },
      hoverinfo: "skip", showlegend: false } as Plotly.Data);
  }

  const seenMat = new Set<string>();
  for (const [mat, geom] of byMat) {
    const color = MATERIAL_COLORS[mat] ?? "#aaaaaa";
    traces.push({ type: "mesh3d", name: mat, ...geom, color, opacity: 0.28,
      flatshading: true, lighting: { ambient:1, diffuse:0, specular:0, roughness:1, fresnel:0 },
      showscale: false, hoverinfo: "skip",
      legendgroup: `mat_${mat}`, showlegend: !seenMat.has(mat) } as unknown as Plotly.Data);
    seenMat.add(mat);
  }

  return traces;
}

interface Props {
  rows: StackingRow[];
}

export function Heap3DPreview({ rows }: Props) {
  const { C, theme } = useTheme();

  const paperBg = theme === "dark" ? C.BG      : "#f8f9fa";
  const sceneBg  = theme === "dark" ? "#0d1520" : "#ffffff";
  const gridCol  = theme === "dark" ? "#2d3348" : "#dddddd";
  const textCol  = theme === "dark" ? "#7d8590" : "#444444";

  const layout: Partial<Plotly.Layout> = {
    height: 320,
    paper_bgcolor: paperBg,
    legend: { font: { color: C.TEXT, size: 10 }, bgcolor: C.CARD, bordercolor: C.BORDER, borderwidth: 1 },
    scene: {
      bgcolor: sceneBg,
      xaxis: {
        title: { text: "Panel", font: { color: textCol, size: 10 } },
        tickvals: [1, 2, 3, 4, 5],
        ticktext: ["P1", "P2", "P3", "P4", "P5"],
        gridcolor: gridCol, color: textCol,
      },
      yaxis: {
        title: { text: "Cell", font: { color: textCol, size: 10 } },
        tickvals: [0, 1, 2, 3],
        ticktext: ["Cell A", "Cell B", "Cell C", "Cell D"],
        gridcolor: gridCol, color: textCol,
      },
      zaxis: {
        title: { text: "Height (m)", font: { color: textCol, size: 10 } },
        range: [0, BOX_H],
        gridcolor: gridCol, color: textCol,
      },
      camera: { eye: { x: 1.8, y: -2.0, z: 1.4 } },
      aspectmode: "manual",
      aspectratio: { x: 2.0, y: 1.4, z: 0.6 },
    },
    margin: { l: 0, r: 0, t: 0, b: 0 },
    font: { color: C.TEXT },
  };

  return (
    <Plot
      data={buildTraces(rows)}
      layout={layout}
      config={{ displayModeBar: false, responsive: true }}
      useResizeHandler
      style={{ width: "100%" }}
    />
  );
}
