import { useTheme } from "../theme";
import { Logo } from "./Logo";
import { APP_NAME, PA_ORDER, paLabel } from "../constants";

/**
 * Landing / home page: the self-explaining narrative for a first-time viewer.
 * Establishes what the app is (a near-real-time operations monitor for any
 * mining company), shows the value chain it models, and maps each capability
 * to the business question it answers.
 */

type TabId =
  | "home" | "dashboard" | "stacking"
  | "multi-pa" | "causality" | "genie";

interface Capability {
  tab: Exclude<TabId, "home">;
  icon: string;
  title: string;
  blurb: string;
}

const CAPABILITIES: Capability[] = [
  {
    tab: "dashboard", icon: "📊", title: "KPI Dashboard",
    blurb: "Plan vs actual for every process area, colour coded against operating limits, with weekly and detailed views plus operator comments.",
  },
  {
    tab: "stacking", icon: "🗓️", title: "Plan Status",
    blurb: "Plan vs actual tonnes, % complete and schedule slip by block, plus a 3D heap view of the pad: cells stacked as lifts and coloured by material, so a supervisor sees what is built and what is behind.",
  },
  {
    tab: "multi-pa", icon: "🔗", title: "Multi-PA Analysis",
    blurb: "Overlay sensors from different process areas on one timeline to correlate cause and effect across the whole operation.",
  },
  {
    tab: "causality", icon: "🕸️", title: "Causality",
    blurb: "Correlation heatmap, sensor network graph and Granger test to find which sensors and areas actually drive the others.",
  },
  {
    tab: "genie", icon: "🧞", title: "Ask Genie",
    blurb: "Ask questions of the operations data in plain English, powered by Databricks Genie. No SQL, no dashboard hunting.",
  },
];

export function LandingPage({ onExplore }: { onExplore: (tab: TabId) => void }) {
  const { C, theme } = useTheme();

  const card: React.CSSProperties = {
    background: C.CARD,
    border: `1px solid ${C.BORDER}`,
    borderRadius: 10,
    padding: "16px 18px",
    textAlign: "left",
    cursor: "pointer",
    transition: "border-color 0.15s, transform 0.15s",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  return (
    <div style={{ overflowY: "auto", height: "100%", background: C.BG }}>
      {/* Hero */}
      <div style={{
        background: theme === "light"
          ? "linear-gradient(135deg, #eafaf0 0%, #f6f8fa 60%)"
          : "linear-gradient(135deg, #0f2318 0%, #0d1117 60%)",
        borderBottom: `1px solid ${C.BORDER}`,
        padding: "40px 32px 34px",
      }}>
        <div style={{ maxWidth: 940, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <Logo size={52} />
            <div>
              <div style={{ fontSize: "1.7rem", fontWeight: 800, color: C.TEXT, lineHeight: 1.1 }}>
                {APP_NAME}
              </div>
              <div style={{ fontSize: "0.9rem", color: C.OK, fontWeight: 600, marginTop: 2 }}>
                Near real time site operations, in a Databricks App
              </div>
            </div>
          </div>

          <p style={{ fontSize: "1rem", color: C.TEXT, lineHeight: 1.6, maxWidth: 760, marginBottom: 8 }}>
            A single operations console for a mining site. It turns your
            operational data into KPIs, trends, plan vs actual tracking,
            causality across process areas, and plain English answers a
            control room can actually use.
          </p>
          <p style={{ fontSize: "0.9rem", color: C.MUTED, lineHeight: 1.6, maxWidth: 760 }}>
            It works for <b>any mining company</b>. Every operation starts
            with <b>Mining</b>, then moves down the chain to product. The app
            assumes you already bring your data into Databricks and that the
            tables behind it exist as Delta tables. The data shown here is
            synthetic.
          </p>

          <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
            <button
              onClick={() => onExplore("dashboard")}
              style={{
                background: C.ACCENT, color: "#fff", border: "none", borderRadius: 7,
                padding: "10px 20px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
              }}
            >
              Open the KPI Dashboard →
            </button>
            <button
              onClick={() => onExplore("genie")}
              style={{
                background: "transparent", color: C.ACCENT, border: `1px solid ${C.ACCENT}66`,
                borderRadius: 7, padding: "10px 20px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
              }}
            >
              🧞 Try Ask Genie
            </button>
          </div>
        </div>
      </div>

      {/* Flowsheet chain */}
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "28px 32px 8px" }}>
        <div style={{
          fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "1.5px", color: C.ACCENT, marginBottom: 12,
        }}>
          The mining value chain this demo models
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {PA_ORDER.map((pa, i) => (
            <div key={pa} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                background: C.CARD, border: `1px solid ${C.BORDER}`, borderRadius: 20,
                padding: "5px 12px", fontSize: "0.75rem", color: C.TEXT, whiteSpace: "nowrap",
              }}>
                <span style={{ color: C.MUTED, marginRight: 5 }}>{i + 1}</span>
                {paLabel(pa)}
              </span>
              {i < PA_ORDER.length - 1 && (
                <span style={{ color: C.BORDER, fontSize: "0.8rem" }}>→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Capability cards */}
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "24px 32px 40px" }}>
        <div style={{
          fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "1.5px", color: C.ACCENT, marginBottom: 14,
        }}>
          What you can do
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
          gap: 14,
        }}>
          {CAPABILITIES.map((c) => (
            <div
              key={c.tab}
              onClick={() => onExplore(c.tab)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = C.ACCENT; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = C.BORDER; }}
              style={card}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "1.15rem" }}>{c.icon}</span>
                <span style={{ fontSize: "0.92rem", fontWeight: 700, color: C.TEXT }}>{c.title}</span>
              </div>
              <p style={{ fontSize: "0.8rem", color: C.MUTED, lineHeight: 1.5, margin: 0 }}>
                {c.blurb}
              </p>
              <span style={{ fontSize: "0.75rem", color: C.ACCENT, fontWeight: 600, marginTop: 2 }}>
                Open →
              </span>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 22, fontSize: "0.72rem", color: C.MUTED, lineHeight: 1.6,
          borderTop: `1px solid ${C.BORDER}`, paddingTop: 16,
        }}>
          Built on Databricks Apps (React + FastAPI) reading from a Databricks
          SQL warehouse. Demo data is synthetic; the same pattern reads a
          site's real Delta tables in Unity Catalog.
        </div>
      </div>
    </div>
  );
}
