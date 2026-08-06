import { useTheme } from "../theme";
import { GENIE_ONE_URL } from "../constants";

export function Header() {
  const { C, theme, toggleTheme } = useTheme();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 16px", background: C.CARD,
      borderBottom: `1px solid ${C.BORDER}`, flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Wordmark — no customer branding */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: 8,
          background: "linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)",
          flexShrink: 0,
        }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: "1rem", letterSpacing: "-1px" }}>OP</span>
        </div>
        <span style={{ color: C.BORDER }}>|</span>
        <span style={{ fontSize: "0.9rem", color: C.TEXT, fontWeight: 700 }}>
          Operations Monitor
        </span>
        <span style={{
          fontSize: "0.6rem", fontWeight: 700, letterSpacing: 1,
          color: C.OK, background: C.OK + "18",
          border: `1px solid ${C.OK}44`,
          borderRadius: 4, padding: "1px 6px",
        }}>
          DEMO
        </span>
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        <a
          href={GENIE_ONE_URL}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: "0.82rem", color: C.ACCENT, textDecoration: "none", fontWeight: 600 }}
        >
          Genie One ↗
        </a>
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            background: "none", border: `1px solid ${C.BORDER}`, borderRadius: 6,
            cursor: "pointer", padding: "5px 9px", fontSize: "0.82rem", color: C.TEXT,
          }}
        >
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>
      </div>
    </div>
  );
}
