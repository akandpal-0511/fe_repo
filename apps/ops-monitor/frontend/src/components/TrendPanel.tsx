import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { useTheme } from "../theme";
import { api } from "../api";
import { DateRangeBar } from "./DateRangeBar";
import type { SelectedTag, TrendPoint, TagProfile } from "../types";

interface Props {
  selected: SelectedTag;
  profiles: TagProfile[];
  onClose: () => void;
  sharedStart?: string;
  sharedEnd?: string;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function TrendPanel({ selected, profiles, onClose, sharedStart, sharedEnd }: Props) {
  const { C } = useTheme();
  const closeBtnStyle: React.CSSProperties = {
    background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.MUTED,
    borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: "0.8rem",
  };
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [ownStart, setOwnStart] = useState(isoDate(weekAgo));
  const [ownEnd,   setOwnEnd]   = useState(isoDate(today));
  const [data,  setData]  = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);

  // use shared dates if provided, otherwise own internal state
  const start = sharedStart ?? ownStart;
  const end   = sharedEnd   ?? ownEnd;
  const ownDatePicker = !sharedStart && !sharedEnd;

  const info = profiles.find((p) => p.Tag === selected.tag);
  const unit = info?.Unit ?? "";
  const lo   = info?.LowerLimit ?? null;
  const hi   = info?.UpperLimit ?? null;

  useEffect(() => {
    if (!start || !end || end <= start) return;
    setLoading(true);
    api.trends([selected.tag], start, end)
      .then((rows) => setData(rows.filter((r) => r.Value !== null && Math.abs(r.Value!) < 1e10)))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selected.tag, start, end]);

  const xVals = data.map((r) => r.Timestamp_AZ);
  const yVals = data.map((r) => r.Value as number);

  const traces: Plotly.Data[] = [
    {
      x: xVals,
      y: yVals,
      mode: "lines",
      name: selected.desc,
      line: { color: C.ACCENT, width: 1.5 },
    } as Plotly.Data,
  ];

  const shapes: Partial<Plotly.Shape>[] = [];
  const annotations: Partial<Plotly.Annotations>[] = [];

  if (lo !== null) {
    shapes.push({ type: "line", x0: 0, x1: 1, xref: "paper", y0: lo, y1: lo,
                  line: { color: C.WARN, dash: "dash", width: 1.2 } });
    annotations.push({ x: 1, xref: "paper", y: lo, text: `Low ${lo}`,
                        showarrow: false, font: { color: C.WARN, size: 9 },
                        xanchor: "right" });
  }
  if (hi !== null) {
    shapes.push({ type: "line", x0: 0, x1: 1, xref: "paper", y0: hi, y1: hi,
                  line: { color: C.ALARM, dash: "dash", width: 1.2 } });
    annotations.push({ x: 1, xref: "paper", y: hi, text: `High ${hi}`,
                        showarrow: false, font: { color: C.ALARM, size: 9 },
                        xanchor: "right" });
  }

  return (
    <div style={{
      background: C.CARD,
      border: `1px solid ${C.BORDER}`,
      borderRadius: 6,
      padding: "10px 12px",
      marginTop: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, fontSize: "0.8rem", color: C.TEXT, fontWeight: 600 }}>
          📈 {selected.desc}&nbsp;
          <code style={{ fontSize: "0.7rem", color: C.MUTED, background: C.CARD2,
                         padding: "1px 5px", borderRadius: 3 }}>
            {selected.tag}
          </code>
        </div>
        {ownDatePicker && (
          <DateRangeBar start={ownStart} end={ownEnd} onStartChange={setOwnStart} onEndChange={setOwnEnd} />
        )}
        <button onClick={onClose} style={closeBtnStyle}>✕</button>
      </div>

      {loading && <div style={{ color: C.MUTED, fontSize: "0.8rem" }}>Loading…</div>}
      {!loading && data.length === 0 && (
        <div style={{ color: C.MUTED, fontSize: "0.8rem" }}>No data found in this range.</div>
      )}
      {!loading && data.length > 0 && (
        <>
          <Plot
            data={traces}
            layout={{
              height: 300,
              hovermode: "x unified",
              xaxis: { title: { text: "Time (AZ)" }, gridcolor: C.BORDER, color: C.MUTED, tickfont: { size: 9 } },
              yaxis: { title: { text: unit || "Value" }, gridcolor: C.BORDER, color: C.MUTED, automargin: true },
              margin: { l: 50, r: 20, t: 20, b: 40 },
              plot_bgcolor: C.CARD,
              paper_bgcolor: C.CARD,
              font: { color: C.MUTED, size: 11 },
              shapes,
              annotations,
              showlegend: false,
              hoverlabel: { bgcolor: C.CARD2, bordercolor: C.BORDER, font: { color: C.TEXT } },
            } as Partial<Plotly.Layout>}
            config={{ displayModeBar: false, responsive: true }}
            useResizeHandler
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: "0.7rem", color: C.MUTED, marginTop: 4 }}>
            {data.length.toLocaleString()} readings · {xVals[0]} → {xVals[xVals.length - 1]}
          </div>
        </>
      )}
    </div>
  );
}

