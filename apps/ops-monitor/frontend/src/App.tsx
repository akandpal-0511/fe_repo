import { useState } from "react";
import { useTheme } from "./theme";
import { Header }          from "./components/Header";
import { ProcessBar }      from "./components/ProcessBar";
import { LandingPage }     from "./components/LandingPage";
import { DashboardTab }    from "./tabs/DashboardTab";
import { StackingTab }     from "./tabs/StackingTab";
import { CrossPATab }      from "./tabs/CrossPATab";
import { CausalityTab }    from "./tabs/CausalityTab";
import { AskGenieTab }     from "./tabs/AskGenieTab";

const TABS = [
  { id: "home",           label: "Home" },
  { id: "dashboard",      label: "Dashboard" },
  { id: "stacking",       label: "Stacking Plan Status" },
  { id: "multi-pa",       label: "Multi-PA Analysis" },
  { id: "causality",      label: "Causality" },
  { id: "genie",          label: "Ask Genie" },
] as const;

type TabId = typeof TABS[number]["id"];

// The flowsheet bar is a live area picker only on Multi-PA (toggle areas in/out).
const SHOW_BAR: Set<TabId> = new Set(["multi-pa"]);

// One-line talking point per tab — shown in a dismissible info banner so a
// first-time viewer immediately understands what each view demonstrates.
const TAB_INFO: Record<TabId, string> = {
  "home":          "Overview of the demo — what this operations-monitoring pattern does and how each view maps to the mining value chain.",
  "dashboard":     "KPI home: plan vs. actual for each process area, colour-coded against limits, with trends and operator comments.",
  "stacking":      "Plan-vs-actual execution grid with a 3D heap view: cells on the ground grid, panels stacked as lifts, coloured by material. Planned-but-unstacked cells show as faint footprints.",
  "multi-pa":      "Overlay sensors from different process areas on one timeline to correlate cause and effect across the operation.",
  "causality":     "Discover which sensors and process areas drive others — cross-correlation heatmap, sensor network graph, and Granger causality test.",
  "genie":         "Ask questions of your operations data in plain English, powered by Databricks Genie (live in production).",
};

export default function App() {
  const { C, theme } = useTheme();
  const [active,      setActive]      = useState<TabId>("home");
  const [infoOpen,    setInfoOpen]    = useState(true);
  // Multi-PA uses a Set of active areas, toggled from the flowsheet bar.
  const [activePAs,   setActivePAs]   = useState<Set<string>>(new Set(["PA-1", "PA-2"]));

  const isHome      = active === "home";
  const isDashboard = active === "dashboard";
  const isMultiPA   = active === "multi-pa";

  function handleProcessStepClick(pa: string) {
    // Bar only renders on Multi-PA now — toggle the area in/out of the set.
    const next = new Set(activePAs);
    next.has(pa) ? next.delete(pa) : next.add(pa);
    setActivePAs(next);
  }

  function renderTab() {
    switch (active) {
      case "home":          return <LandingPage onExplore={setActive} />;
      case "dashboard":     return <DashboardTab />;
      case "stacking":      return <StackingTab />;
      case "multi-pa":      return (
        <CrossPATab
          activePAsOverride={activePAs}
          onActivePAsChange={setActivePAs}
        />
      );
      case "causality":     return <CausalityTab />;
      case "genie":         return <AskGenieTab />;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <Header />

      <nav style={{
        display: "flex", alignItems: "stretch", gap: 0, padding: "0 10px",
        background: C.CARD, borderBottom: `1px solid ${C.BORDER}`,
        overflowX: "auto", flexShrink: 0, scrollbarWidth: "none",
      }}>
        {TABS.map(tab => {
          const isActive = active === tab.id;
          return (
            <button key={tab.id} onClick={() => setActive(tab.id)} style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 14px", whiteSpace: "nowrap",
              fontSize: "0.8rem", fontWeight: isActive ? 700 : 500,
              color: isActive ? C.TEXT : C.MUTED,
              borderBottom: `2px solid ${isActive ? C.ACCENT : "transparent"}`,
              transition: "color 0.15s, border-color 0.15s",
            }}>
              {tab.label}
            </button>
          );
        })}
      </nav>

      {!isHome && (infoOpen ? (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "7px 14px",
          background: theme === "light" ? "#ddf4ff" : "#12233b",
          borderBottom: `1px solid ${C.BORDER}`, flexShrink: 0,
        }}>
          <span style={{ fontSize: "0.82rem", lineHeight: 1.4, flexShrink: 0, color: C.ACCENT }}>ⓘ</span>
          <span style={{ fontSize: "0.78rem", lineHeight: 1.4, color: C.TEXT, flex: 1 }}>
            {TAB_INFO[active]}
          </span>
          <button
            onClick={() => setInfoOpen(false)}
            title="Hide"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: C.MUTED, fontSize: "0.9rem", lineHeight: 1, padding: 0, flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setInfoOpen(true)}
          title="Show tab info"
          style={{
            alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer",
            color: C.ACCENT, fontSize: "0.72rem", padding: "3px 14px", flexShrink: 0,
          }}
        >
          ⓘ What is this tab?
        </button>
      ))}

      {SHOW_BAR.has(active) && (
        <ProcessBar
          highlighted={null}
          highlightedSet={isMultiPA ? activePAs : undefined}
          multiSelect={isMultiPA}
          onStepClick={handleProcessStepClick}
        />
      )}

      <div style={{
        flex: 1,
        overflow: isDashboard ? "hidden" : "auto",
        padding: (isDashboard || isHome) ? 0 : "10px 14px",
        background: C.BG,
      }}>
        {renderTab()}
      </div>
    </div>
  );
}
