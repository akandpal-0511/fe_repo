import { useState } from "react";
import { useTheme } from "./theme";
import { Header }          from "./components/Header";
import { ProcessBar }      from "./components/ProcessBar";
import { DashboardTab }    from "./tabs/DashboardTab";
import { StackingTab }     from "./tabs/StackingTab";
import { Explorer3DTab }   from "./tabs/Explorer3DTab";
import { SensorTrendsTab } from "./tabs/SensorTrendsTab";
import { CrossPATab }      from "./tabs/CrossPATab";
import { AskGenieTab }     from "./tabs/AskGenieTab";

const TABS = [
  { id: "dashboard",      label: "Dashboard" },
  { id: "stacking",       label: "Stacking Plan Status" },
  { id: "3d-explorer",    label: "3D Viewer" },
  { id: "sensor-trends",  label: "Sensor Trends" },
  { id: "multi-pa",       label: "Multi-PA Analysis" },
  { id: "genie",          label: "Ask Genie" },
] as const;

type TabId = typeof TABS[number]["id"];

const SHOW_BAR: Set<TabId> = new Set(["stacking", "3d-explorer", "sensor-trends", "multi-pa"]);
const STATIC_PA: Partial<Record<TabId, string>> = { stacking: "Stacking" };

export default function App() {
  const { C } = useTheme();
  const [active,      setActive]      = useState<TabId>("dashboard");
  const [sensorPA,    setSensorPA]    = useState("Mining");
  const [explorerPA,  setExplorerPA]  = useState("Mining");
  // Multi-PA uses a Set
  const [activePAs,   setActivePAs]   = useState<Set<string>>(new Set(["Mining", "Crushing"]));

  const isDashboard = active === "dashboard";
  const isMultiPA   = active === "multi-pa";

  function handleProcessStepClick(pa: string) {
    if (isMultiPA) {
      // toggle in/out of set
      const next = new Set(activePAs);
      next.has(pa) ? next.delete(pa) : next.add(pa);
      setActivePAs(next);
    } else if (active === "sensor-trends") {
      setSensorPA(pa);
    } else if (active === "3d-explorer") {
      setExplorerPA(pa);
    } else {
      setSensorPA(pa);
      setActive("sensor-trends");
    }
  }

  const highlighted = STATIC_PA[active] ??
    (active === "sensor-trends" ? sensorPA :
     active === "3d-explorer"   ? explorerPA : null);

  function renderTab() {
    switch (active) {
      case "dashboard":     return <DashboardTab />;
      case "stacking":      return <StackingTab />;
      case "3d-explorer":   return (
        <Explorer3DTab
          key={explorerPA}
          initialArea={explorerPA}
          onAreaChange={setExplorerPA}
        />
      );
      case "sensor-trends": return (
        <SensorTrendsTab
          key={sensorPA}
          initialArea={sensorPA}
          onAreaChange={setSensorPA}
        />
      );
      case "multi-pa":      return (
        <CrossPATab
          activePAsOverride={activePAs}
          onActivePAsChange={setActivePAs}
        />
      );
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

      {SHOW_BAR.has(active) && (
        <ProcessBar
          highlighted={isMultiPA ? null : highlighted}
          highlightedSet={isMultiPA ? activePAs : undefined}
          multiSelect={isMultiPA}
          onStepClick={handleProcessStepClick}
        />
      )}

      <div style={{
        flex: 1,
        overflow: isDashboard ? "hidden" : "auto",
        padding: isDashboard ? 0 : "10px 14px",
        background: C.BG,
      }}>
        {renderTab()}
      </div>
    </div>
  );
}
