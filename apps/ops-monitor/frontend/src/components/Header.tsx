import { useTheme } from "../theme";
import { GENIE_ONE_URL, APP_NAME } from "../constants";
import { Logo } from "./Logo";

export function Header() {
  const { C, theme, toggleTheme } = useTheme();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 16px", background: C.CARD,
      borderBottom: `1px solid ${C.BORDER}`, flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Generic mining mark — no customer branding */}
        <Logo size={34} />
        <span style={{ fontSize: "0.9rem", color: C.TEXT, fontWeight: 700 }}>
          {APP_NAME}
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
