import { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { useTheme } from "../theme";
import { api } from "../api";
import type { TagProfile, ForecastResponse, EarlyWarningSensor } from "../types";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

const today   = new Date();
const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);

const AREAS_FOR_EARLY_WARNING = [
  "PA-1", "PA-2", "PA-3", "PA-4", "PA-5", "PA-6", "PA-7",
  "PA-8", "PA-9", "PA-10", "PA-11", "PA-12", "PA-13",
];

const HORIZON_OPTS = [6, 12, 24, 48] as const;

// ── Breach banner ────────────────────────────────────────────────────────────

function BreachBanner({ breach, unit }: { breach: ForecastResponse["breach"]; unit: string }) {
  const { C } = useTheme();
  if (breach.warning_level === "ok") {
    return (
      <div style={{ background: C.CARD2, border: `1px solid ${C.OK}`, borderRadius: 6,
          padding: "8px 14px", color: C.OK, fontSize: "0.82rem", marginBottom: 10 }}>
        ✓ No limit breach projected in the forecast window.
      </div>
    );
  }
  const bg    = breach.warning_level === "alarm" ? "#3a1a1a" : "#2d2510";
  const color = breach.warning_level === "alarm" ? C.ALARM : C.WARN;
  const icon  = breach.warning_level === "alarm" ? "⚠️" : "⚡";
  const msg   = breach.hours !== null
    ? `${icon} Projected ${breach.direction === "high" ? "upper" : "lower"} limit breach in ~${breach.hours} h (value: ${breach.projected_value} ${unit})`
    : `${icon} Approaching limit — monitor closely.`;
  return (
    <div style={{ background: bg, border: `1px solid ${color}`, borderRadius: 6,
        padding: "8px 14px", color, fontSize: "0.82rem", marginBottom: 10 }}>
      {msg}
    </div>
  );
}

// ── Early-warning watchlist row ───────────────────────────────────────────────

function WatchlistRow({ s, C }: { s: EarlyWarningSensor; C: Record<string, string> }) {
  const bar = Math.round(Math.abs(s.corr) * 100);
  const dir = s.direction === "positive" ? "▲ moves together" : "▼ inverse";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
        borderBottom: `1px solid ${C.BORDER}` }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.colour, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.78rem", color: C.TEXT, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.description}
        </div>
        <div style={{ fontSize: "0.68rem", color: C.MUTED }}>{s.pa} · {dir}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: "0.78rem", color: C.ACCENT }}>leads by {s.lag_hours} h</div>
        <div style={{ width: 60, height: 4, background: C.BORDER, borderRadius: 2, marginTop: 2 }}>
          <div style={{ width: `${bar}%`, height: "100%", background: C.ACCENT, borderRadius: 2 }} />
        </div>
        <div style={{ fontSize: "0.65rem", color: C.MUTED, textAlign: "right" }}>
          r={s.corr.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────

export function PredictTab() {
  const { C } = useTheme();

  // Tag selection — two-level: PA → sensor
  const [profiles,    setProfiles]    = useState<TagProfile[]>([]);
  const [selectedPA,  setSelectedPA]  = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<TagProfile | null>(null);

  // Date + horizon
  const [start,   setStart]   = useState(isoDate(monthAgo));
  const [end,     setEnd]     = useState(isoDate(today));
  const [horizon, setHorizon] = useState<number>(12);

  // Results
  const [forecast,  setForecast]  = useState<ForecastResponse | null>(null);
  const [watchlist, setWatchlist] = useState<EarlyWarningSensor[]>([]);
  const [fcLoading, setFcLoading] = useState(false);
  const [ewLoading, setEwLoading] = useState(false);
  const [fcError,   setFcError]   = useState<string | null>(null);

  // Load all non-calculated profiles once
  useEffect(() => {
    api.allProfiles()
      .then(p => setProfiles(p.filter(x => !x.IsCalculated)))
      .catch(() => setProfiles([]));
  }, []);

  // Sorted unique PA list
  const paList = Array.from(new Set(profiles.map(p => p.PerformanceArea))).sort();

  // Sensors for the chosen PA
  const sensorsForPA = selectedPA
    ? profiles.filter(p => p.PerformanceArea === selectedPA)
    : [];

  function runForecast(tag: TagProfile) {
    setFcLoading(true);
    setFcError(null);
    setForecast(null);
    setWatchlist([]);

    const fcPromise = api.forecast({
      tag:           tag.Tag,
      start,
      end,
      horizon_hours: horizon,
      lo:            tag.LowerLimit,
      hi:            tag.UpperLimit,
    });

    // Use 90-day lookback for early warning — cross-PA correlations need more history
    const ewStart = isoDate(new Date(new Date(end).setDate(new Date(end).getDate() - 90)));
    const ewPromise = api.earlyWarning({
      target_tag:    tag.Tag,
      areas:         AREAS_FOR_EARLY_WARNING,
      start:         ewStart,
      end,
      max_lag_hours: 48,
      threshold:     0.2,
      top_n:         10,
    });

    fcPromise
      .then(r => {
        setForecast(r);
        if (r.error) setFcError(r.error);
      })
      .catch(e => setFcError(String(e)))
      .finally(() => setFcLoading(false));

    setEwLoading(true);
    ewPromise
      .then(setWatchlist)
      .catch(() => setWatchlist([]))
      .finally(() => setEwLoading(false));
  }

  // ── Plotly traces ──────────────────────────────────────────────────────────

  function buildPlotData(): Plotly.Data[] {
    if (!forecast) return [];
    const traces: Plotly.Data[] = [];

    // History line
    if (forecast.history.length) {
      traces.push({
        type: "scatter", mode: "lines",
        x: forecast.history.map(p => p.t),
        y: forecast.history.map(p => p.v),
        name: "History",
        line: { color: C.ACCENT, width: 1.5 },
      });
    }

    // Forecast confidence band (filled area)
    if (forecast.forecast.length) {
      const fts = forecast.forecast.map(p => p.t);
      traces.push({
        type: "scatter", mode: "none",
        x: [...fts, ...fts.slice().reverse()],
        y: [...forecast.forecast.map(p => p.hi95), ...forecast.forecast.map(p => p.lo95).reverse()],
        fill: "toself",
        fillcolor: "rgba(88,166,255,0.12)",
        showlegend: false, hoverinfo: "skip",
      });
      traces.push({
        type: "scatter", mode: "lines",
        x: fts,
        y: forecast.forecast.map(p => p.v),
        name: `${horizon}h Forecast`,
        line: { color: C.ACCENT, width: 2, dash: "dot" },
      });
    }

    // Limit lines
    if (forecast.hi !== null) {
      const xs = [...(forecast.history.map(p => p.t)), ...(forecast.forecast.map(p => p.t))];
      traces.push({
        type: "scatter", mode: "lines",
        x: xs, y: Array(xs.length).fill(forecast.hi),
        name: "Upper Limit",
        line: { color: C.ALARM, width: 1, dash: "dash" },
      });
    }
    if (forecast.lo !== null) {
      const xs = [...(forecast.history.map(p => p.t)), ...(forecast.forecast.map(p => p.t))];
      traces.push({
        type: "scatter", mode: "lines",
        x: xs, y: Array(xs.length).fill(forecast.lo),
        name: "Lower Limit",
        line: { color: C.WARN, width: 1, dash: "dash" },
      });
    }

    return traces;
  }

  const plotLayout: Partial<Plotly.Layout> = {
    paper_bgcolor: "transparent",
    plot_bgcolor:  "transparent",
    font:          { color: C.TEXT, size: 11 },
    margin:        { t: 24, r: 16, b: 36, l: 52 },
    xaxis:  { gridcolor: C.BORDER, color: C.MUTED, showgrid: true },
    yaxis:  {
      gridcolor: C.BORDER, color: C.MUTED, showgrid: true,
      title: { text: forecast ? (forecast.unit || "") : "" },
    },
    legend: { font: { color: C.MUTED, size: 10 }, bgcolor: "transparent" },
    shapes: forecast?.forecast.length
      ? [{
          type: "line" as const,
          x0: forecast.forecast[0].t, x1: forecast.forecast[0].t,
          y0: 0, y1: 1, yref: "paper" as const,
          line: { color: C.MUTED, width: 1, dash: "dot" },
        }]
      : [],
  };

  const inputStyle: React.CSSProperties = {
    background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.TEXT,
    borderRadius: 4, padding: "4px 8px", fontSize: "0.78rem",
  };

  const btnStyle: React.CSSProperties = {
    background: C.ACCENT, border: "none", color: "#fff",
    borderRadius: 4, padding: "5px 14px", fontSize: "0.78rem",
    cursor: "pointer", fontWeight: 600,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Controls ── */}
      <div style={{ background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8,
          padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>

        {/* Step 1 — Performance area */}
        <div>
          <div style={{ fontSize: "0.7rem", color: C.MUTED, marginBottom: 3 }}>Performance area</div>
          <select
            style={{ ...inputStyle, minWidth: 160 }}
            value={selectedPA}
            onChange={e => {
              setSelectedPA(e.target.value);
              setSelectedTag(null);
              setForecast(null);
              setWatchlist([]);
              setFcError(null);
            }}>
            <option value="">— select area —</option>
            {paList.map(pa => <option key={pa} value={pa}>{pa}</option>)}
          </select>
        </div>

        {/* Step 2 — Sensor within that PA */}
        <div style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: "0.7rem", color: C.MUTED, marginBottom: 3 }}>Sensor</div>
          <select
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            value={selectedTag?.Tag ?? ""}
            disabled={!selectedPA}
            onChange={e => {
              const tag = sensorsForPA.find(p => p.Tag === e.target.value) ?? null;
              setSelectedTag(tag);
              setForecast(null);
              setWatchlist([]);
              setFcError(null);
            }}>
            <option value="">— select sensor —</option>
            {sensorsForPA.map(p => (
              <option key={p.Tag} value={p.Tag}>{p.Description}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div>
          <div style={{ fontSize: "0.7rem", color: C.MUTED, marginBottom: 3 }}>Training start</div>
          <input type="date" style={inputStyle} value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: "0.7rem", color: C.MUTED, marginBottom: 3 }}>Training end</div>
          <input type="date" style={inputStyle} value={end} onChange={e => setEnd(e.target.value)} />
        </div>

        {/* Horizon */}
        <div>
          <div style={{ fontSize: "0.7rem", color: C.MUTED, marginBottom: 3 }}>Forecast horizon</div>
          <select style={inputStyle} value={horizon} onChange={e => setHorizon(Number(e.target.value))}>
            {HORIZON_OPTS.map(h => <option key={h} value={h}>{h} h</option>)}
          </select>
        </div>

        <button
          style={{ ...btnStyle, opacity: !selectedTag || fcLoading ? 0.5 : 1 }}
          disabled={!selectedTag || fcLoading}
          onClick={() => selectedTag && runForecast(selectedTag)}>
          {fcLoading ? "Running…" : "Run Predict"}
        </button>
      </div>

      {/* ── Error ── */}
      {fcError && (
        <div style={{ color: C.ALARM, fontSize: "0.8rem", padding: "8px 12px",
            background: "#3a1a1a", border: `1px solid ${C.ALARM}`, borderRadius: 6 }}>
          {fcError}
        </div>
      )}

      {/* ── Main content ── */}
      {forecast && !fcError && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>

          {/* Left: forecast chart + breach banner */}
          <div style={{ flex: "1 1 480px", background: C.CARD,
              border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: "0.8rem", color: C.MUTED, marginBottom: 6,
                display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, color: C.TEXT }}>{forecast.description}</span>
              {forecast.unit && <span>[{forecast.unit}]</span>}
              <span>· {forecast.history.length} h training · {horizon} h forecast</span>
              {forecast.model_used && (
                <span style={{
                  background: C.CARD2, border: `1px solid ${C.ACCENT}`,
                  borderRadius: 4, padding: "1px 7px", fontSize: "0.7rem",
                  color: C.ACCENT, fontWeight: 600, letterSpacing: "0.04em",
                }}>
                  {forecast.model_used.toUpperCase()}
                </span>
              )}
              {Object.keys(forecast.model_scores).length > 0 && (
                <span style={{ fontSize: "0.68rem", color: C.MUTED }}>
                  RMSE —{" "}
                  {Object.entries(forecast.model_scores)
                    .map(([m, s]) => `${m}: ${s == null || s < 0 ? "fail" : Number(s).toFixed(3)}`)
                    .join(" · ")}
                </span>
              )}
            </div>

            <BreachBanner breach={forecast.breach} unit={forecast.unit} />

            <Plot
              data={buildPlotData() as Plotly.Data[]}
              layout={plotLayout}
              style={{ width: "100%", height: 300 }}
              config={{ displayModeBar: false, responsive: true }}
            />
          </div>

          {/* Right: early-warning watchlist */}
          <div style={{ flex: "0 1 280px", background: C.CARD,
              border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: C.TEXT, marginBottom: 4 }}>
              Early-warning sensors
            </div>
            <div style={{ fontSize: "0.7rem", color: C.MUTED, marginBottom: 8 }}>
              Sensors that historically lead this tag. Watch these first.
            </div>

            {ewLoading && (
              <div style={{ color: C.MUTED, fontSize: "0.78rem" }}>Scanning for leading indicators…</div>
            )}
            {!ewLoading && watchlist.length === 0 && (
              <div style={{ color: C.MUTED, fontSize: "0.78rem" }}>
                No leading sensors found — this sensor may be driven by local process conditions
                rather than upstream PAs.
              </div>
            )}
            {!ewLoading && watchlist.length > 0 && watchlist[0].corr < 0.4 && (
              <div style={{ fontSize: "0.68rem", color: C.WARN, marginBottom: 8,
                background: C.WARN + "15", border: `1px solid ${C.WARN}44`,
                borderRadius: 4, padding: "4px 8px" }}>
                ⚠ Weak signals (r&lt;0.4) — treat as indicative only
              </div>
            )}
            {!ewLoading && watchlist.map(s => (
              <WatchlistRow key={s.tag} s={s} C={C} />
            ))}
          </div>
        </div>
      )}

      {!forecast && !fcLoading && !fcError && (
        <div style={{ color: C.MUTED, fontSize: "0.8rem", padding: "20px 0", textAlign: "center" }}>
          Select a performance area, then a sensor, then click <strong>Run Predict</strong>.
        </div>
      )}
    </div>
  );
}
