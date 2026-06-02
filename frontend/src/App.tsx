import { useState } from "react";
import { PERF_AREAS } from "./constants";
import { useTheme } from "./theme";
import { Header } from "./components/Header";
import { StackingTab } from "./tabs/StackingTab";
import { SensorTrendsTab } from "./tabs/SensorTrendsTab";
import { CrossPATab } from "./tabs/CrossPATab";
import { Explorer3DTab } from "./tabs/Explorer3DTab";

export default function App() {
  const { C } = useTheme();
  const [activeTab, setActiveTab] = useState<string>("Sensor Trends");

  function renderTab() {
    if (activeTab === "Stacking")          return <StackingTab />;
    if (activeTab === "Sensor Trends")     return <SensorTrendsTab />;
    if (activeTab === "Multi-PA Analysis") return <CrossPATab />;
    if (activeTab === "3D Explorer")       return <Explorer3DTab />;
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <Header />

      {/* Tab bar */}
      <div style={{
        display: "flex",
        overflowX: "auto",
        background: C.CARD,
        borderBottom: `1px solid ${C.BORDER}`,
        flexShrink: 0,
        scrollbarWidth: "none",
      }}>
        {PERF_AREAS.map((area) => (
          <button
            key={area}
            onClick={() => setActiveTab(area)}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === area
                ? `2px solid ${C.ACCENT}`
                : "2px solid transparent",
              color: activeTab === area ? C.ACCENT : C.TEXT,
              padding: "7px 12px",
              fontSize: "0.74rem",
              fontWeight: activeTab === area ? 700 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "color 0.15s, border-color 0.15s",
              flexShrink: 0,
            }}
          >
            {area}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "10px 14px",
        background: C.BG,
      }}>
        {renderTab()}
      </div>
    </div>
  );
}
