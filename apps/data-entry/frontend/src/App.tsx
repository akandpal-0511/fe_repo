import { useState } from "react";
import { useTheme } from "./theme";
import { EntryForm }     from "./EntryForm";
import { MonthlyReport } from "./MonthlyReport";

type View = "entry" | "report";

export default function App() {
  const { C, theme, toggleTheme } = useTheme();
  const [view, setView] = useState<View>("entry");

  return (
    <div style={{ minHeight: "100vh", background: C.BG, color: C.TEXT }}>
      {/* Header */}
      <div style={{
        background: C.CARD,
        borderBottom: `1px solid ${C.BORDER}`,
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        gap: 0,
      }}>
        <span style={{
          fontSize: "0.9rem", fontWeight: 700,
          color: C.TEXT, padding: "14px 0", marginRight: 24,
          whiteSpace: "nowrap",
        }}>
          Physicals Data Entry
        </span>

        {/* Nav tabs */}
        <nav style={{ display: "flex", flex: 1 }}>
          {(["entry", "report"] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "12px 18px",
              background: "none", border: "none",
              borderBottom: `2px solid ${view === v ? C.ACCENT : "transparent"}`,
              color: view === v ? C.TEXT : C.MUTED,
              fontWeight: view === v ? 700 : 500,
              fontSize: "0.83rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}>
              {v === "entry" ? "Daily Entry" : "Monthly Report"}
            </button>
          ))}
        </nav>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          style={{
            background: "none", border: `1px solid ${C.BORDER}`,
            borderRadius: 6, cursor: "pointer",
            padding: "5px 10px", fontSize: "0.8rem",
            color: C.MUTED, display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {theme === "light" ? "🌙 Dark" : "☀️ Light"}
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "24px" }}>
        {view === "entry"  && <EntryForm />}
        {view === "report" && <MonthlyReport />}
      </div>
    </div>
  );
}
