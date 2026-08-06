import { useEffect, useRef, useState } from "react";
import Plot from "react-plotly.js";
import type { PlotMouseEvent } from "plotly.js";
import { useTheme } from "../theme";
import type { PlotlyFigure, SelectedTag } from "../types";

interface Props {
  figure: PlotlyFigure | null;
  loading?: boolean;
  onTagClick?: (sel: SelectedTag) => void;
  onAreaClick?: (area: string) => void;
  height?: number;
}

export function FlowsheetChart({ figure, loading, onTagClick, onAreaClick, height }: Props) {
  if (loading) return <Spinner />;
  if (!figure) return null;

  function handleClick(event: Readonly<PlotMouseEvent>) {
    const pt = event.points[0] as unknown as { customdata?: string[] };
    if (!pt?.customdata) return;
    const [tag, desc] = pt.customdata;
    if (!tag) return;
    if (onAreaClick) {
      onAreaClick(tag);
    } else if (onTagClick) {
      onTagClick({ tag, desc: desc ?? tag });
    }
  }

  const layout = {
    ...(figure.layout as object),
    ...(height ? { height } : {}),
    autosize: true,
  };

  return (
    <Plot
      data={figure.data as Plotly.Data[]}
      layout={layout as Partial<Plotly.Layout>}
      config={{ displayModeBar: false, scrollZoom: false, responsive: true }}
      onClick={handleClick}
      useResizeHandler
      style={{ width: "100%" }}
    />
  );
}

export function Spinner({ text = "Loading…" }: { text?: string }) {
  const { C } = useTheme();
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "16px 0",
      color: C.MUTED,
      fontSize: "0.8rem",
    }}>
      <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
      {text}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
