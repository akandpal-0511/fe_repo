import { useState, useEffect } from "react";
import { useTheme } from "./theme";

const COLS = [
  { key: "month",                   label: "Month",              decimals: null },
  { key: "total_crushed_tons",      label: "Crushed (t)",        decimals: 0    },
  { key: "total_stacked_tons",      label: "Stacked (t)",        decimals: 0    },
  { key: "grade_tcu_pct",           label: "TCu %",              decimals: 3    },
  { key: "ton_tcu",                 label: "Ton TCu",            decimals: 0    },
  { key: "mining_primary_tons",     label: "Mining Primary (t)", decimals: 0    },
  { key: "raffinate_a_avg_flow_gpm", label: "Raff-A Flow (GPM)", decimals: 1   },
  { key: "raffinate_a_cu_grade_g_l", label: "Raff-A Cu (g/L)",  decimals: 3   },
  { key: "pls_a_avg_flow_gpm",      label: "PLS-A Flow (GPM)",   decimals: 1    },
  { key: "pls_b_avg_flow_gpm",      label: "PLS-B Flow (GPM)",   decimals: 1    },
  { key: "ew_block1_avg_amps",      label: "EW B1 Amps",         decimals: 0    },
  { key: "ew_block1_avg_efficiency", label: "EW B1 Eff.",        decimals: 3   },
  { key: "total_cu_harvested_lb",   label: "Cu Harvested (lb)",  decimals: 0    },
  { key: "acid_consumed_total_st",  label: "Acid Consumed (ST)", decimals: 1    },
  { key: "acid_delivered_st",       label: "Acid Delivered (ST)", decimals: 1  },
];

export function MonthlyReport() {
  const { C } = useTheme();
  const [rows, setRows]       = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  function fetchData() {
    setLoading(true);
    setError("");
    fetch("/api/monthly-report")
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data: Record<string, unknown>[]) => {
        const sorted = [...data].sort((a, b) => String(b.month).localeCompare(String(a.month)));
        setRows(sorted); setLoading(false); setLastRefresh(new Date());
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }

  // refetch every time this component mounts (i.e. every tab switch)
  useEffect(() => { fetchData(); }, []);

  const fmt = (v: unknown, decimals: number | null) => {
    if (v == null) return "—";
    if (decimals === null) return String(v);
    if (typeof v === "number") return v.toFixed(decimals);
    return String(v);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: C.TEXT, margin: 0 }}>
          Monthly Report
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "0.72rem", color: C.MUTED }}>
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              fontSize: "0.78rem", padding: "5px 14px", fontWeight: 600,
              background: "none", border: `1px solid ${C.BORDER}`,
              borderRadius: 4, color: C.ACCENT, cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? "Refreshing…" : "⟳ Refresh"}
          </button>
        </div>
      </div>
      <p style={{ fontSize: "0.78rem", color: C.MUTED, marginBottom: 20 }}>
        Aggregated from daily entries — tonnage sums, flow-weighted grades, avg-nonzero for flow rates. Refreshes automatically each time you open this tab.
      </p>

      {loading && <div style={{ color: C.MUTED, fontSize: "0.85rem" }}>Loading…</div>}
      {error   && <div style={{ color: "#e05c2a", fontSize: "0.85rem" }}>Error: {error}</div>}

      {!loading && !error && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.key} style={{
                    padding: "7px 12px", textAlign: "left", whiteSpace: "nowrap",
                    fontSize: "0.71rem", color: C.MUTED, fontWeight: 600,
                    borderBottom: `2px solid ${C.BORDER}`,
                    background: C.CARD,
                  }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length} style={{ padding: "20px 12px", color: C.MUTED, fontSize: "0.82rem" }}>
                    No data yet — submit some daily entries first.
                  </td>
                </tr>
              ) : rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.CARD }}>
                  {COLS.map(c => (
                    <td key={c.key} style={{
                      padding: "7px 12px", fontSize: "0.82rem", color: C.TEXT,
                      borderBottom: `1px solid ${C.BORDER}`,
                      fontWeight: c.key === "month" ? 600 : 400,
                    }}>
                      {fmt(row[c.key], c.decimals)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
