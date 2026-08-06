import { useState } from "react";
import { useTheme } from "../theme";

interface Props {
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  label?: string;
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

const UNITS = ["days", "weeks", "months", "years"] as const;
type Unit = (typeof UNITS)[number];

function toDays(n: number, unit: Unit): number {
  if (unit === "days")   return n;
  if (unit === "weeks")  return n * 7;
  if (unit === "months") return n * 30;
  return n * 365; // years
}

export function DateRangeBar({ start, end, onStartChange, onEndChange, label }: Props) {
  const { C, theme } = useTheme();
  const [qty,  setQty]  = useState(1);
  const [unit, setUnit] = useState<Unit>("weeks");

  const inputStyle: React.CSSProperties = {
    background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.TEXT,
    borderRadius: 4, padding: "3px 6px", fontSize: "0.75rem",
    colorScheme: theme as "dark" | "light",
  };
  const selectStyle: React.CSSProperties = {
    background: C.CARD2, border: `1px solid ${C.BORDER}`, color: C.TEXT,
    borderRadius: 4, padding: "3px 6px", fontSize: "0.72rem", cursor: "pointer",
  };

  function applyQuick() {
    const days = toDays(qty, unit);
    onStartChange(isoDate(new Date(Date.now() - days * 86400000)));
    onEndChange(isoDate(new Date()));
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      padding: "6px 10px",
      background: C.CARD,
      border: `1px solid ${C.BORDER}`,
      borderRadius: 5,
    }}>
      {label && (
        <span style={{ fontSize: "0.7rem", color: C.MUTED, flexShrink: 0 }}>{label}</span>
      )}

      {/* Quick select: number + unit + Apply */}
      <span style={{ fontSize: "0.7rem", color: C.MUTED, flexShrink: 0 }}>Last</span>
      <input
        type="number"
        min={1} max={365}
        value={qty}
        onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
        style={{ ...inputStyle, width: 46, textAlign: "center" }}
      />
      <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} style={selectStyle}>
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <button
        onClick={applyQuick}
        style={{
          background: C.ACCENT + "22", border: `1px solid ${C.ACCENT}66`,
          color: C.ACCENT, borderRadius: 4,
          fontSize: "0.7rem", fontWeight: 600, cursor: "pointer", padding: "3px 8px",
        }}
      >
        Apply
      </button>

      <span style={{ color: C.MUTED, fontSize: "0.75rem" }}>|</span>

      {/* Manual pickers */}
      <input
        type="date" value={start} onChange={(e) => onStartChange(e.target.value)}
        style={inputStyle}
      />
      <span style={{ color: C.MUTED, fontSize: "0.75rem" }}>→</span>
      <input
        type="date" value={end} onChange={(e) => onEndChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}
