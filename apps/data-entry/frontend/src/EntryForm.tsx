import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "./theme";

const API = "/api/nuton-load";

const SECTIONS = [
  {
    label: "Stacking / Crushing",
    fields: [
      { key: "crushed_d_tons",          label: "Crushed – Day Shift",       unit: "t",    lo: 0,     hi: 5000   },
      { key: "crushed_n_tons",          label: "Crushed – Night Shift",     unit: "t",    lo: 0,     hi: 5000   },
      { key: "wet_total_crushed_tons",  label: "Wet Total Crushed",         unit: "t",    lo: 0,     hi: 10000, derived: true },
      { key: "dry_crushed_tons",        label: "Dry Crushed",               unit: "t",    lo: 0,     hi: 9000   },
      { key: "stacked_d_tons",          label: "Stacked – Day Shift",       unit: "t",    lo: 0,     hi: 5000   },
      { key: "stacked_n_tons",          label: "Stacked – Night Shift",     unit: "t",    lo: 0,     hi: 5000   },
      { key: "total_stacked_tons",      label: "Total Stacked",             unit: "t",    lo: 0,     hi: 10000, derived: true },
      { key: "grade_tcu_pct",           label: "Grade TCu",                 unit: "%",    lo: 0.10,  hi: 0.60   },
      { key: "grade_ascu_pct",          label: "Grade AsCu",                unit: "%",    lo: 0.05,  hi: 0.40   },
      { key: "grade_cucn_pct",          label: "Grade CuCN",                unit: "%",    lo: 0.001, hi: 0.050  },
      { key: "grade_cus_pct",           label: "Grade CuSU",                unit: "%",    lo: 0.01,  hi: 0.10   },
      { key: "acid_cons_lb_per_t",      label: "Acid Consumption",          unit: "lb/t", lo: 5,     hi: 30     },
    ],
  },
  {
    label: "Mining",
    fields: [
      { key: "mining_tons_primary",   label: "Primary",   unit: "t", lo: 0, hi: 50000 },
      { key: "mining_tons_secondary", label: "Secondary", unit: "t", lo: 0, hi: 30000 },
      { key: "mining_tons_tertiary",  label: "Tertiary",  unit: "t", lo: 0, hi: 20000 },
    ],
  },
  {
    label: "Raffinate Zone-A",
    fields: [
      { key: "raffinate_a_acid_cure_flow_gpm", label: "Acid Cure Flow", unit: "GPM", lo: 0,    hi: 500  },
      { key: "raffinate_a_main_flow_gpm",      label: "Main Flow",      unit: "GPM", lo: 1500, hi: 2500 },
      { key: "raffinate_a_cu_grade_g_l",       label: "Cu Grade",       unit: "g/L", lo: 0.01, hi: 0.50 },
      { key: "raffinate_a_acid_grade_g_l",     label: "Acid Grade",     unit: "g/L", lo: 1,    hi: 10   },
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
      { key: "pls_b_flow_gpm",     label: "PLS Flow",    unit: "GPM", lo: 500,  hi: 2000 },
      { key: "pls_b_cu_grade_g_l", label: "Cu Grade",    unit: "g/L", lo: 0.5,  hi: 5.0  },
      { key: "pls_b_acid_g_l",     label: "Acid H₂SO₄",  unit: "g/L", lo: 0.1,  hi: 2.0  },
      { key: "pls_b_ph",           label: "pH",           unit: "pH",  lo: 1.0,  hi: 4.0  },
    ],
  },
  {
    label: "PLS Zone-A",
    fields: [
      { key: "pls_a_flow_gpm",     label: "PLS Flow",    unit: "GPM", lo: 1000, hi: 3000 },
      { key: "pls_a_cu_grade_g_l", label: "Cu Grade",    unit: "g/L", lo: 0.5,  hi: 5.0  },
      { key: "pls_a_acid_g_l",     label: "Acid H₂SO₄",  unit: "g/L", lo: 0.1,  hi: 2.0  },
      { key: "pls_a_ph",           label: "pH",           unit: "pH",  lo: 1.0,  hi: 4.0  },
    ],
  },
  {
    label: "Electrowinning (EW)",
    fields: [
      { key: "ew_block1_dc_amps",     label: "Block 1 DC Amps",    unit: "A",  lo: 20000, hi: 30000  },
      { key: "ew_block2_dc_amps",     label: "Block 2 DC Amps",    unit: "A",  lo: 20000, hi: 30000  },
      { key: "ew_block1_efficiency",  label: "Block 1 Efficiency", unit: "",   lo: 0.85,  hi: 0.98   },
      { key: "ew_block2_efficiency",  label: "Block 2 Efficiency", unit: "",   lo: 0.85,  hi: 0.98   },
      { key: "total_cu_harvested_lb", label: "Total Cu Harvested", unit: "lb", lo: 0,     hi: 100000 },
    ],
  },
  {
    label: "Acid",
    fields: [
      { key: "acid_delivered_short_tons",      label: "Delivered",             unit: "ST", lo: 0, hi: 500 },
      { key: "acid_sx_usage_short_tons",       label: "SX Usage",              unit: "ST", lo: 0, hi: 100 },
      { key: "acid_cure_a_totalizer_st",       label: "Cure Zone-A Totalizer", unit: "ST", lo: 0, hi: 200 },
      { key: "acid_cure_b_totalizer_st",       label: "Cure Zone-B Totalizer", unit: "ST", lo: 0, hi: 200 },
      { key: "acid_auxiliary_totalizer_st",    label: "Auxiliary Totalizer",   unit: "ST", lo: 0, hi: 100 },
      { key: "acid_heap_leach_total_st",       label: "Heap Leach Total",      unit: "ST", lo: 0, hi: 500 },
      { key: "total_acid_consumed_short_tons", label: "Total Consumed",        unit: "ST", lo: 0, hi: 600, derived: true },
    ],
  },
] as const;

type FormData = Record<string, string>;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function autoDerive(data: FormData): FormData {
  const n = data;
  const next = { ...n };
  const f = (k: string) => parseFloat(n[k] ?? "");

  const cd = f("crushed_d_tons"), cn = f("crushed_n_tons");
  if (!isNaN(cd) && !isNaN(cn)) next.wet_total_crushed_tons = String(cd + cn);

  const sd = f("stacked_d_tons"), sn = f("stacked_n_tons");
  if (!isNaN(sd) && !isNaN(sn)) next.total_stacked_tons = String(sd + sn);

  const sx = f("acid_sx_usage_short_tons"), ca = f("acid_cure_a_totalizer_st");
  const cb = f("acid_cure_b_totalizer_st"), aux = f("acid_auxiliary_totalizer_st");
  if ([sx, ca, cb, aux].every(x => !isNaN(x)))
    next.total_acid_consumed_short_tons = String(sx + ca + cb + aux);

  return next;
}

// ── All columns for the recent entries table, grouped by section ──────────────
const ALL_COLS: { key: string; label: string; group: string }[] = [
  // identity
  { key: "report_date",                       label: "Date",               group: "" },
  // Stacking
  { key: "crushed_d_tons",                    label: "Crush D (t)",        group: "Stacking" },
  { key: "crushed_n_tons",                    label: "Crush N (t)",        group: "Stacking" },
  { key: "wet_total_crushed_tons",            label: "Wet Crushed (t)",    group: "Stacking" },
  { key: "dry_crushed_tons",                  label: "Dry Crushed (t)",    group: "Stacking" },
  { key: "stacked_d_tons",                    label: "Stack D (t)",        group: "Stacking" },
  { key: "stacked_n_tons",                    label: "Stack N (t)",        group: "Stacking" },
  { key: "total_stacked_tons",                label: "Total Stacked (t)",  group: "Stacking" },
  { key: "grade_tcu_pct",                     label: "TCu %",              group: "Stacking" },
  { key: "grade_ascu_pct",                    label: "AsCu %",             group: "Stacking" },
  { key: "grade_cucn_pct",                    label: "CuCN %",             group: "Stacking" },
  { key: "grade_cus_pct",                     label: "CuSU %",             group: "Stacking" },
  { key: "acid_cons_lb_per_t",                label: "Acid Cons (lb/t)",   group: "Stacking" },
  // Mining
  { key: "mining_tons_primary",               label: "Mining Pri (t)",     group: "Mining" },
  { key: "mining_tons_secondary",             label: "Mining Sec (t)",     group: "Mining" },
  { key: "mining_tons_tertiary",              label: "Mining Ter (t)",     group: "Mining" },
  // Raffinate A
  { key: "raffinate_a_acid_cure_flow_gpm",    label: "Raff-A Cure (GPM)",  group: "Raff A" },
  { key: "raffinate_a_main_flow_gpm",         label: "Raff-A Flow (GPM)",  group: "Raff A" },
  { key: "raffinate_a_cu_grade_g_l",          label: "Raff-A Cu (g/L)",    group: "Raff A" },
  { key: "raffinate_a_acid_grade_g_l",        label: "Raff-A Acid (g/L)",  group: "Raff A" },
  // Raffinate B
  { key: "raffinate_b_pad_flow_gpm",          label: "Raff-B Flow (GPM)",  group: "Raff B" },
  { key: "raffinate_b_cu_grade_g_l",          label: "Raff-B Cu (g/L)",    group: "Raff B" },
  { key: "raffinate_b_acid_grade_g_l",        label: "Raff-B Acid (g/L)",  group: "Raff B" },
  // PLS B
  { key: "pls_b_flow_gpm",                    label: "PLS-B Flow (GPM)",   group: "PLS B" },
  { key: "pls_b_cu_grade_g_l",                label: "PLS-B Cu (g/L)",     group: "PLS B" },
  { key: "pls_b_acid_g_l",                    label: "PLS-B Acid (g/L)",   group: "PLS B" },
  { key: "pls_b_ph",                          label: "PLS-B pH",           group: "PLS B" },
  // PLS A
  { key: "pls_a_flow_gpm",                    label: "PLS-A Flow (GPM)",   group: "PLS A" },
  { key: "pls_a_cu_grade_g_l",                label: "PLS-A Cu (g/L)",     group: "PLS A" },
  { key: "pls_a_acid_g_l",                    label: "PLS-A Acid (g/L)",   group: "PLS A" },
  { key: "pls_a_ph",                          label: "PLS-A pH",           group: "PLS A" },
  // EW
  { key: "ew_block1_dc_amps",                 label: "EW B1 Amps",         group: "EW" },
  { key: "ew_block2_dc_amps",                 label: "EW B2 Amps",         group: "EW" },
  { key: "ew_block1_efficiency",              label: "EW B1 Eff.",         group: "EW" },
  { key: "ew_block2_efficiency",              label: "EW B2 Eff.",         group: "EW" },
  { key: "total_cu_harvested_lb",             label: "Cu Harv. (lb)",      group: "EW" },
  // Acid
  { key: "acid_delivered_short_tons",         label: "Acid Deliv. (ST)",   group: "Acid" },
  { key: "acid_sx_usage_short_tons",          label: "SX Usage (ST)",      group: "Acid" },
  { key: "acid_cure_a_totalizer_st",          label: "Cure A (ST)",        group: "Acid" },
  { key: "acid_cure_b_totalizer_st",          label: "Cure B (ST)",        group: "Acid" },
  { key: "acid_auxiliary_totalizer_st",       label: "Aux (ST)",           group: "Acid" },
  { key: "acid_heap_leach_total_st",          label: "HL Total (ST)",      group: "Acid" },
  { key: "total_acid_consumed_short_tons",    label: "Total Acid (ST)",    group: "Acid" },
];

function RecentTable({ refresh, onEdit, onDelete }: { refresh: number; onEdit: (row: Record<string, unknown>) => void; onDelete: () => void }) {
  const { C } = useTheme();
  const [rows, setRows]   = useState<Record<string, unknown>[]>([]);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    fetch(`${API}?limit=${limit}`)
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        setRows([...data].sort((a, b) => String(b.report_date).localeCompare(String(a.report_date))));
      })
      .catch(() => {});
  }, [refresh, limit]);

  if (!rows.length) return null;

  const fmt = (v: unknown, key: string) => {
    if (v == null) return "—";
    if (typeof v === "number")
      return v.toFixed(key.includes("grade") || key.includes("efficiency") || key.includes("ph") ? 3 : 0);
    return String(v);
  };

  // build group spans for the second header row
  const groups: { label: string; span: number }[] = [];
  for (const col of ALL_COLS) {
    const last = groups[groups.length - 1];
    if (last && last.label === col.group) last.span++;
    else groups.push({ label: col.group, span: 1 });
  }

  const thStyle: React.CSSProperties = {
    padding: "5px 10px", textAlign: "left", whiteSpace: "nowrap",
    fontSize: "0.7rem", fontWeight: 600,
    borderBottom: `1px solid ${C.BORDER}`,
    position: "sticky", top: 0, background: C.CARD,
  };

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: C.TEXT }}>
          Recent Entries
        </span>
        <select
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          style={{
            fontSize: "0.75rem", padding: "2px 6px",
            background: C.CARD, color: C.TEXT,
            border: `1px solid ${C.BORDER}`, borderRadius: 4,
          }}
        >
          {[10, 20, 50, 90].map(n => (
            <option key={n} value={n}>Last {n}</option>
          ))}
        </select>
        <span style={{ fontSize: "0.72rem", color: C.MUTED }}>{rows.length} rows · scroll right for all fields →</span>
      </div>

      <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto", border: `1px solid ${C.BORDER}`, borderRadius: 6 }}>
        <table style={{ borderCollapse: "collapse", width: "max-content" }}>
          <thead>
            {/* group header row */}
            <tr>
              <th style={{ ...thStyle, borderRight: `1px solid ${C.BORDER}` }} colSpan={2} /> {/* actions cols */}
              {groups.map((g, i) => (
                <th key={i} colSpan={g.span} style={{
                  ...thStyle,
                  color: g.label ? C.ACCENT : "transparent",
                  borderRight: `1px solid ${C.BORDER}`,
                  fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em",
                  paddingBottom: 2,
                }}>
                  {g.label || "·"}
                </th>
              ))}
            </tr>
            {/* column header row */}
            <tr>
              <th style={{ ...thStyle, color: C.MUTED, top: 24, paddingRight: 8 }} colSpan={2}>Actions</th>
              {ALL_COLS.map(c => (
                <th key={c.key} style={{ ...thStyle, color: C.MUTED, top: 24 }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.CARD }}>
                <td style={{ padding: "4px 4px", borderBottom: `1px solid ${C.BORDER}`, whiteSpace: "nowrap" }}>
                  <button
                    onClick={() => onEdit(row)}
                    style={{
                      fontSize: "0.72rem", padding: "2px 8px",
                      background: "none", border: `1px solid ${C.ACCENT}`,
                      borderRadius: 3, color: C.ACCENT, cursor: "pointer", fontWeight: 600,
                    }}
                  >
                    Edit
                  </button>
                </td>
                <td style={{ padding: "4px 8px", borderBottom: `1px solid ${C.BORDER}`, whiteSpace: "nowrap" }}>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete entry for ${row.report_date}?`)) return;
                      await fetch(`${API}/${row.report_date}`, { method: "DELETE" });
                      onDelete();
                    }}
                    style={{
                      fontSize: "0.72rem", padding: "2px 8px",
                      background: "none", border: `1px solid ${C.ALARM}`,
                      borderRadius: 3, color: C.ALARM, cursor: "pointer", fontWeight: 600,
                    }}
                  >
                    Delete
                  </button>
                </td>
                {ALL_COLS.map(c => (
                  <td key={c.key} style={{
                    padding: "4px 10px", fontSize: "0.78rem", color: C.TEXT,
                    borderBottom: `1px solid ${C.BORDER}`,
                    whiteSpace: "nowrap",
                    fontWeight: c.key === "report_date" ? 600 : 400,
                  }}>
                    {fmt(row[c.key], c.key)}
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

// ── Main form ─────────────────────────────────────────────────────────────────
export function EntryForm() {
  const { C } = useTheme();
  const [data, setData]       = useState<FormData>({ report_date: today() });
  const [status, setStatus]   = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [errMsg, setErrMsg]   = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [totalCount, setTotalCount]   = useState<number>(0);
  const tableRef = useRef<HTMLDivElement>(null);

  const loadDate = useCallback((d: string) => {
    fetch(`${API}/${d}`)
      .then(r => r.ok ? r.json() : null)
      .then(row => {
        if (row) {
          const s: FormData = {};
          for (const [k, v] of Object.entries(row)) s[k] = v != null ? String(v) : "";
          setData(s);
        } else {
          setData({ report_date: d });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { loadDate(today()); }, [loadDate]);

  useEffect(() => {
    fetch(`${API}?limit=9999`).then(r => r.json()).then((d: unknown[]) => setTotalCount(d.length)).catch(() => {});
  }, [refresh]);

  function handleChange(key: string, val: string) {
    setData(prev => autoDerive({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving"); setErrMsg("");
    try {
      const payload: Record<string, string | number | null> = {};
      for (const [k, v] of Object.entries(data)) {
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
      setRefresh(r => r + 1);
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setErrMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }

  function handleEdit(row: Record<string, unknown>) {
    const s: FormData = {};
    for (const [k, v] of Object.entries(row)) s[k] = v != null ? String(v) : "";
    setData(s);
    setEditingDate(String(row.report_date));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div>

      {/* ── compact how-to bar ── */}
      <div style={{
        marginBottom: 16, padding: "7px 14px",
        background: C.CARD, border: `1px solid ${C.BORDER}`,
        borderRadius: 6, fontSize: "0.75rem", color: C.MUTED,
        display: "flex", alignItems: "center", gap: 20,
        flexWrap: "wrap",
      }}>
        <span>📅 <strong style={{ color: C.TEXT }}>Pick date</strong> — loads existing entry automatically</span>
        <span style={{ color: C.BORDER }}>|</span>
        <span>✏️ <span style={{ color: C.ACCENT }}>auto</span> fields calculate themselves</span>
        <span style={{ color: C.BORDER }}>|</span>
        <span>💾 <strong style={{ color: C.TEXT }}>Save</strong> button stays visible while scrolling</span>
        <span style={{ color: C.BORDER }}>|</span>
        <span>🔁 <strong style={{ color: C.TEXT }}>Edit</strong> any past row from the table below</span>
      </div>

      <form id="entry-form" onSubmit={handleSubmit}>
        {/* ── sticky date + save row ── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          background: C.BG, borderBottom: `1px solid ${C.BORDER}`,
          display: "flex", alignItems: "center", gap: 12,
          padding: "8px 0", marginBottom: 16, flexWrap: "wrap",
        }}>
          <label style={{ fontSize: "0.82rem", fontWeight: 600, color: C.TEXT, whiteSpace: "nowrap" }}>Report Date</label>
          <input
            type="date"
            value={data.report_date ?? today()}
            onChange={e => { setData({ report_date: e.target.value }); loadDate(e.target.value); setEditingDate(null); }}
            style={{ ...inputStyle(C), width: 160 }}
          />
          {editingDate && (
            <>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: C.ACCENT }}>Editing {editingDate}</span>
              <button
                type="button"
                onClick={() => { setData({ report_date: today() }); setEditingDate(null); loadDate(today()); }}
                style={{
                  fontSize: "0.75rem", padding: "4px 10px",
                  background: "none", border: `1px solid ${C.BORDER}`,
                  borderRadius: 4, color: C.MUTED, cursor: "pointer",
                }}
              >
                ✕ Cancel
              </button>
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {status === "ok"    && <span style={{ color: "#22a06b", fontSize: "0.8rem", fontWeight: 600 }}>✓ Saved</span>}
            {status === "error" && <span style={{ color: "#e05c2a", fontSize: "0.8rem", fontWeight: 600 }}>✗ {errMsg || "Save failed"}</span>}
            <button
              type="submit"
              disabled={status === "saving"}
              style={{
                padding: "6px 22px", fontSize: "0.85rem", fontWeight: 700,
                background: C.ACCENT, color: "#fff", border: "none",
                borderRadius: 5, cursor: status === "saving" ? "not-allowed" : "pointer",
                opacity: status === "saving" ? 0.6 : 1, whiteSpace: "nowrap",
              }}
            >
              {status === "saving" ? "Saving…" : editingDate ? "Update Entry" : "Save Entry"}
            </button>
          </div>
        </div>

        {/* Sections */}
        {SECTIONS.map(section => (
          <div key={section.label} style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: "0.72rem", fontWeight: 700, color: C.ACCENT,
              textTransform: "uppercase", letterSpacing: "0.07em",
              paddingBottom: 6, borderBottom: `1px solid ${C.BORDER}`, marginBottom: 12,
            }}>
              {section.label}
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
              gap: "10px 16px",
            }}>
              {section.fields.map(f => {
                const val = data[f.key] ?? "";
                const isDerived = "derived" in f && f.derived;
                const n = parseFloat(val);
                const outOfRange = val !== "" && !isNaN(n) && (n < f.lo || n > f.hi);
                return (
                  <div key={f.key}>
                    <label style={{
                      display: "block", fontSize: "0.71rem",
                      color: C.MUTED, fontWeight: 600, marginBottom: 3,
                    }}>
                      {f.label}
                      {f.unit && <span style={{ fontWeight: 400 }}> ({f.unit})</span>}
                      {isDerived && <span style={{ color: C.ACCENT, marginLeft: 5 }}>auto</span>}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={val}
                      readOnly={isDerived}
                      onChange={e => handleChange(f.key, e.target.value)}
                      placeholder={`${f.lo}–${f.hi}`}
                      style={{
                        ...inputStyle(C),
                        borderColor: outOfRange ? "#e05c2a" : C.BORDER,
                        background: isDerived ? C.BG : C.CARD,
                        color: isDerived ? C.MUTED : C.TEXT,
                        cursor: isDerived ? "default" : "text",
                      }}
                    />
                    {outOfRange && (
                      <div style={{ fontSize: "0.67rem", color: "#e05c2a", marginTop: 2 }}>
                        Expected {f.lo}–{f.hi}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      </form>

      {/* ── floating pill: jump to table ── */}
      {totalCount > 0 && (
        <button
          onClick={() => tableRef.current?.scrollIntoView({ behavior: "smooth" })}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 100,
            background: C.ACCENT, color: "#fff",
            border: "none", borderRadius: 999,
            padding: "10px 18px", fontSize: "0.82rem", fontWeight: 700,
            cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            display: "flex", alignItems: "center", gap: 8,
          }}
        >
          📋 {totalCount} {totalCount === 1 ? "entry" : "entries"} ↓
        </button>
      )}

      {/* ── info banner above table ── */}
      <div ref={tableRef} style={{
        marginTop: 36, marginBottom: 8,
        padding: "10px 14px",
        background: C.CARD, border: `1px solid ${C.BORDER}`,
        borderRadius: 6, fontSize: "0.78rem", color: C.MUTED,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: C.ACCENT, fontSize: "1rem" }}>ⓘ</span>
        <span>
          <strong style={{ color: C.TEXT }}>{totalCount} saved {totalCount === 1 ? "entry" : "entries"}</strong> — newest first.
          Click <strong style={{ color: C.TEXT }}>Edit</strong> on any row to load it back into the form above for corrections.
        </span>
      </div>

      <RecentTable refresh={refresh} onEdit={handleEdit} onDelete={() => setRefresh(r => r + 1)} />
    </div>
  );
}

function inputStyle(C: Record<string, string>): React.CSSProperties {
  return {
    width: "100%", boxSizing: "border-box",
    padding: "5px 8px", fontSize: "0.82rem",
    border: `1px solid ${C.BORDER}`, borderRadius: 4,
    background: C.CARD, color: C.TEXT, outline: "none",
  };
}
