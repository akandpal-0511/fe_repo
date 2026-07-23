import { useTheme } from "../theme";

export function AskGenieTab() {
  const { C } = useTheme();
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "60vh", gap: 16, color: C.MUTED,
    }}>
      <div style={{ fontSize: "3rem" }}>🧞</div>
      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: C.TEXT }}>Ask Genie</div>
      <div style={{ fontSize: "0.85rem", color: C.MUTED, textAlign: "center", maxWidth: 420, lineHeight: 1.6 }}>
        AI-powered natural language queries over your operations data.<br />
        Available in the production workspace.
      </div>
      <div style={{
        background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 8,
        padding: "10px 20px", fontSize: "0.78rem", color: C.MUTED, fontStyle: "italic",
      }}>
        Coming soon in this demo
      </div>
    </div>
  );
}
