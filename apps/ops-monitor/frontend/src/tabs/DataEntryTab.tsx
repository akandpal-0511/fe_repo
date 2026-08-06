import { useState, useEffect, useCallback } from "react";
import { useTheme } from "../theme";

const API = "/api/nuton-load";

// ── field definitions ─────────────────────────────────────────────────────────
const SECTIONS = [
  {
    label: "Stacking / Crushing",
    fields: [
      { key: "crushed_d_tons",         label: "Crushed – Day Shift",       unit: "t",    lo: 0,     hi: 5000  },
      { key: "crushed_n_tons",         label: "Crushed – Night Shift",     unit: "t",    lo: 0,     hi: 5000  },
      { key: "wet_total_crushed_tons", label: "Wet Total Crushed",         unit: "t",    lo: 0,     hi: 10000, derived: true },
      { key: "dry_crushed_tons",       label: "Dry Crushed",               unit: "t",    lo: 0,     hi: 9000  },
      { key: "stacked_d_tons",         label: "Stacked – Day Shift",       unit: "t",    lo: 0,     hi: 5000  },
      { key: "stacked_n_tons",         label: "Stacked – Night Shift",     unit: "t",    lo: 0,     hi: 5000  },
      { key: "total_stacked_tons",     label: "Total Stacked",             unit: "t",    lo: 0,     hi: 10000, derived: true },
      { key: "grade_tcu_pct",          label: "Grade TCu",                 unit: "%",    lo: 0.10,  hi: 0.60  },
      { key: "grade_ascu_pct",         label: "Grade AsCu",                unit: "%",    lo: 0.05,  hi: 0.40  },
      { key: "grade_cucn_pct",         label: "Grade CuCN",                unit: "%",    lo: 0.001, hi: 0.050 },
      { key: "grade_cus_pct",          label: "Grade CuSU",                unit: "%",    lo: 0.01,  hi: 0.10  },
      { key: "acid_cons_lb_per_t",     label: "Acid Consumption",          unit: "lb/t", lo: 5,     hi: 30    },
    ],
  },
  {
    label: "Mining",
    fields: [
      { key: "mining_tons_primary",   label: "Mining – Primary",   unit: "t", lo: 0, hi: 50000 },
      { key: "mining_tons_secondary", label: "Mining – Secondary", unit: "t", lo: 0, hi: 30000 },
      { key: "mining_tons_tertiary",  label: "Mining – Tertiary",  unit: "t", lo: 0, hi: 20000 },
    ],
  },
  {
    label: "Raffinate Zone-A",
    fields: [
      { key: "raffinate_a_acid_cure_flow_gpm", label: "Acid Cure Flow",  unit: "GPM", lo: 0,    hi: 500  },
      { key: "raffinate_a_main_flow_gpm",      label: "Main Flow",       unit: "GPM", lo: 1500, hi: 2500 },
      { key: "raffinate_a_cu_grade_g_l",       label: "Cu Grade",        unit: "g/L", lo: 0.01, hi: 0.50 },
      { key: "raffinate_a_acid_grade_g_l",     label: "Acid Grade",      unit: "g/L", lo: 1,    hi: 10   },
    ],
  },
  {
    label: "Raffinate Zone-B",
    fields: [
      { key: "raffinate_b_pad_flow_gpm",   label: "Pad Flow",   unit: "GPM", lo: 500,  hi: 2000 },
      { key: "raffinate_b_cu_grade_g_l",   label: "Cu Grade",   unit: "g/L", lo: 0.01, hi: 0.40 },
      { key: "raffinate_b_acid_grade_g_l", label: "Acid Grade", unit: "g/L", lo: 1,    hi: 8    },
    ],
  },
  {
    label: "PLS Zone-B",
    fields: [
      { key: "pls_b_flow_gpm",      label: "PLS Flow",   unit: "GPM", lo: 500,  hi: 2000 },
      { key: "pls_b_cu_grade_g_l",  label: "Cu Grade",   unit: "g/L", lo: 0.5,  hi: 5.0  },
      { key: "pls_b_acid_g_l",      label: "Acid H₂SO₄", unit: "g/L", lo: 0.1,  hi: 2.0  },
      { key: "pls_b_ph",            label: "pH",          unit: "pH",  lo: 1.0,  hi: 4.0  },
    ],
  },
  {
    label: "PLS Zone-A",
    fields: [
      { key: "pls_a_flow_gpm",      label: "PLS Flow",   unit: "GPM", lo: 1000, hi: 3000 },
      { key: "pls_a_cu_grade_g_l",  label: "Cu Grade",   unit: "g/L", lo: 0.5,  hi: 5.0  },
      { key: "pls_a_acid_g_l",      label: "Acid H₂SO₄", unit: "g/L", lo: 0.1,  hi: 2.0  },
      { key: "pls_a_ph",            label: "pH",          unit: "pH",  lo: 1.0,  hi: 4.0  },
    ],
  },
  {
    label: "Electrowinning (EW)",
    fields: [
      { key: "ew_block1_dc_amps",     label: "Block 1 DC Amps",     unit: "A",  lo: 20000, hi: 30000 },
      { key: "ew_block2_dc_amps",     label: "Block 2 DC Amps",     unit: "A",  lo: 20000, hi: 30000 },
      { key: "ew_block1_efficiency",  label: "Block 1 Efficiency",  unit: "",   lo: 0.85,  hi: 0.98  },
      { key: "ew_block2_efficiency",  label: "Block 2 Efficiency",  unit: "",   lo: 0.85,  hi: 0.98  },
      { key: "total_cu_harvested_lb", label: "Total Cu Harvested",  unit: "lb", lo: 0,     hi: 100000 },
    ],
  },
  {
    label: "Acid",
    fields: [
      { key: "acid_delivered_short_tons",     label: "Acid Delivered",        unit: "ST", lo: 0, hi: 500 },
      { key: "acid_sx_usage_short_tons",      label: "SX Usage",              unit: "ST", lo: 0, hi: 100 },
      { key: "acid_cure_a_totalizer_st",      label: "Cure Zone-A Totalizer", unit: "ST", lo: 0, hi: 200 },
      { key: "acid_cure_b_totalizer_st",      label: "Cure Zone-B Totalizer", unit: "ST", lo: 0, hi: 200 },
      { key: "acid_auxiliary_totalizer_st",   label: "Auxiliary Totalizer",   unit: "ST", lo: 0, hi: 100 },
      { key: "acid_heap_leach_total_st",      label: "Heap Leach Total",      unit: "ST", lo: 0, hi: 500 },
      { key: "total_acid_consumed_short_tons", label: "Total Consumed",       unit: "ST", lo: 0, hi: 600, derived: true },
    ],
  },
] as const;

type FormData = Record<string, string>;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isOutOfRange(val: string, lo: number, hi: number) {
  const n = parseFloat(val);
  if (isNaN(n)) return false;
  return n < lo || n > hi;
}

// ── recent entries table ──────────────────────────────────────────────────────
function RecentEntries({ refresh }: { refresh: number }) {
  const { C } = useTheme();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    fetch(`${API}?limit=10`)
      .then(r => r.json())
      .then(setRows)
      .catch(() => {});
  }, [refresh]);

  if (!rows.length) return null;

  const COLS = [
    { key: "report_date",              label: "Date"         },
    { key: "wet_total_crushed_tons",   label: "Crushed (t)"  },
    { key: "total_stacked_tons",       label: "Stacked (t)"  },
    { key: "grade_tcu_pct",            label: "TCu %"        },
    { key: "total_cu_harvested_lb",    label: "Cu Harv. (lb)"},
    { key: "total_acid_consumed_short_tons", label: "Acid (ST)" },
  ];

  const th: React.CSSProperties = {
    padding: "6px 10px", textAlign: "left", fontSize: "0.72rem",
    color: C.MUTED, fontWeight: 600, borderBottom: `1px solid ${C.BORDER}`,
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "5px 10px", fontSize: "0.78rem", color: C.TEXT,
    borderBottom: `1px solid ${C.BORDER}`,
  };

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 700, color: C.TEXT, marginBottom: 8 }}>
        Recent Entries (last 10)
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 500 }}>
          <thead>
            <tr>{COLS.map(c => <th key={c.key} style={th}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.CARD }}>
                {COLS.map(c => (
                  <td key={c.key} style={td}>
                    {row[c.key] != null
                      ? typeof row[c.key] === "number"
                        ? (row[c.key] as number).toFixed(c.key.includes("grade") || c.key.includes("efficiency") ? 3 : 0)
                        : String(row[c.key])
                      : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export function DataEntryTab() {
  const { C } = useTheme();
  const [formData, setFormData] = useState<FormData>({ report_date: today() });
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // load existing entry when date changes
  const loadDate = useCallback((d: string) => {
    fetch(`${API}/${d}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const strData: FormData = {};
          for (const [k, v] of Object.entries(data)) {
            strData[k] = v != null ? String(v) : "";
          }
          setFormData(strData);
        } else {
          setFormData({ report_date: d });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadDate(today());
  }, [loadDate]);

  function handleChange(key: string, val: string) {
    setFormData(prev => {
      const next = { ...prev, [key]: val };
      // auto-derive wet_total_crushed_tons
      const d = parseFloat(next.crushed_d_tons ?? "");
      const n = parseFloat(next.crushed_n_tons ?? "");
      if (!isNaN(d) && !isNaN(n)) next.wet_total_crushed_tons = String(d + n);
      // auto-derive total_stacked_tons
      const sd = parseFloat(next.stacked_d_tons ?? "");
      const sn = parseFloat(next.stacked_n_tons ?? "");
      if (!isNaN(sd) && !isNaN(sn)) next.total_stacked_tons = String(sd + sn);
      // auto-derive total_acid_consumed
      const sx  = parseFloat(next.acid_sx_usage_short_tons ?? "");
      const ca  = parseFloat(next.acid_cure_a_totalizer_st ?? "");
      const cb  = parseFloat(next.acid_cure_b_totalizer_st ?? "");
      const aux = parseFloat(next.acid_auxiliary_totalizer_st ?? "");
      if ([sx, ca, cb, aux].every(x => !isNaN(x)))
        next.total_acid_consumed_short_tons = String(sx + ca + cb + aux);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setErrorMsg("");
    try {
      const payload: Record<string, string | number | null> = {};
      for (const [k, v] of Object.entries(formData)) {
        if (k === "report_date") { payload[k] = v; continue; }
        const n = parseFloat(v);
        payload[k] = v === "" ? null : isNaN(n) ? null : n;
      }
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setStatus("ok");
      setRefreshKey(k => k + 1);
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }

  // ── styles ───────────────────────────────────────────────────────────────────
  const sectionHeader: React.CSSProperties = {
    fontSize: "0.75rem", fontWeight: 700, color: C.ACCENT,
    textTransform: "uppercase", letterSpacing: "0.06em",
    padding: "10px 0 6px", borderBottom: `1px solid ${C.BORDER}`,
    marginBottom: 10, marginTop: 20,
  };
  const fieldGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "10px 16px",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "0.72rem", color: C.MUTED,
    marginBottom: 3, fontWeight: 600,
  };
  const inputBase: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    padding: "5px 8px", fontSize: "0.82rem",
    border: `1px solid ${C.BORDER}`, borderRadius: 4,
    background: C.CARD, color: C.TEXT, outline: "none",
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 40 }}>
      <div style={{ fontSize: "1rem", fontWeight: 700, color: C.TEXT, marginBottom: 4 }}>
        Daily Data Entry
      </div>
      <div style={{ fontSize: "0.78rem", color: C.MUTED, marginBottom: 16 }}>
        Enter operator readings for a single shift day. Derived fields update automatically.
      </div>

      <form onSubmit={handleSubmit}>
        {/* Date row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <label style={{ fontSize: "0.8rem", fontWeight: 600, color: C.TEXT }}>
            Report Date
          </label>
          <input
            type="date"
            value={formData.report_date ?? today()}
            onChange={e => {
              setFormData({ report_date: e.target.value });
              loadDate(e.target.value);
            }}
            style={{ ...inputBase, width: 160 }}
          />
        </div>

        {/* Sections */}
        {SECTIONS.map(section => (
          <div key={section.label}>
            <div style={sectionHeader}>{section.label}</div>
            <div style={fieldGrid}>
              {section.fields.map(f => {
                const val = formData[f.key] ?? "";
                const outOfRange = val !== "" && isOutOfRange(val, f.lo, f.hi);
                const isDerived = "derived" in f && f.derived;
                return (
                  <div key={f.key}>
                    <label style={labelStyle}>
                      {f.label}
                      {f.unit ? (
                        <span style={{ fontWeight: 400, color: C.MUTED }}> ({f.unit})</span>
                      ) : null}
                      {isDerived && (
                        <span style={{ fontWeight: 400, color: C.ACCENT, marginLeft: 4 }}>auto</span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={val}
                      readOnly={isDerived}
                      onChange={e => handleChange(f.key, e.target.value)}
                      placeholder={`${f.lo}–${f.hi}`}
                      style={{
                        ...inputBase,
                        borderColor: outOfRange ? "#e05c2a" : C.BORDER,
                        background: isDerived
                          ? (C.BG)
                          : C.CARD,
                        color: isDerived ? C.MUTED : C.TEXT,
                        cursor: isDerived ? "default" : "text",
                      }}
                    />
                    {outOfRange && (
                      <div style={{ fontSize: "0.68rem", color: "#e05c2a", marginTop: 2 }}>
                        Expected {f.lo}–{f.hi}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Submit */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24 }}>
          <button
            type="submit"
            disabled={status === "saving"}
            style={{
              padding: "8px 24px", fontSize: "0.82rem", fontWeight: 700,
              background: C.ACCENT, color: "#fff", border: "none",
              borderRadius: 5, cursor: status === "saving" ? "not-allowed" : "pointer",
              opacity: status === "saving" ? 0.7 : 1,
            }}
          >
            {status === "saving" ? "Saving…" : "Save Entry"}
          </button>

          {status === "ok" && (
            <span style={{ fontSize: "0.8rem", color: "#22a06b", fontWeight: 600 }}>
              ✓ Saved successfully
            </span>
          )}
          {status === "error" && (
            <span style={{ fontSize: "0.8rem", color: "#e05c2a", fontWeight: 600 }}>
              ✗ {errorMsg || "Save failed"}
            </span>
          )}
        </div>
      </form>

      <RecentEntries refresh={refreshKey} />
    </div>
  );
}
