import { useState } from "react";
import { useTheme } from "../theme";
import { api } from "../api";

export function Header() {
  const { C, theme, toggleTheme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());

  async function handleRefresh() {
    setRefreshing(true);
    await api.clearCache();
    setTime(new Date().toLocaleTimeString());
    window.location.reload();
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "7px 12px 6px",
      borderBottom: `2px solid ${C.ACCENT}`,
      background: "linear-gradient(90deg,rgba(88,166,255,0.08) 0%,transparent 60%)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
        <h1 style={{
          margin: 0,
          fontSize: "1.15rem",
          fontWeight: 700,
          color: C.TEXT,
          letterSpacing: "0.5px",
        }}>
          Operations Monitor
        </h1>
        <span style={{
          fontSize: "0.6rem",
          color: C.OK,
          background: "rgba(63,185,80,0.12)",
          border: "1px solid rgba(63,185,80,0.35)",
          borderRadius: 3,
          padding: "2px 7px",
          fontWeight: 700,
          letterSpacing: 1,
        }}>
          LIVE
        </span>
      </div>

      <span style={{ fontSize: "0.7rem", color: C.MUTED }}>
        {time}
      </span>

      <button
        onClick={toggleTheme}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        style={{
          background: C.CARD2,
          border: `1px solid ${C.BORDER}`,
          color: C.MUTED,
          borderRadius: 4,
          padding: "3px 10px",
          fontSize: "0.8rem",
          cursor: "pointer",
        }}
      >
        {theme === "dark" ? "☀" : "🌙"}
      </button>

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        title="Clear cache & refresh"
        style={{
          background: C.CARD2,
          border: `1px solid ${C.BORDER}`,
          color: C.MUTED,
          borderRadius: 4,
          padding: "3px 10px",
          fontSize: "0.8rem",
          cursor: "pointer",
          transition: "color 0.15s, border-color 0.15s",
        }}
      >
        {refreshing ? "…" : "↻"}
      </button>
    </div>
  );
}
