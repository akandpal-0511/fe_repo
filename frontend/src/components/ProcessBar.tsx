import { useEffect, useState } from "react";
import { useTheme } from "../theme";
import { api } from "../api";

const STEPS = [
  { pa: "Mining",               label: "Mining",       icon: "⛏" },
  { pa: "Crushing",             label: "Crushing",     icon: "①" },
  { pa: "Agglomeration",        label: "Agglom.",      icon: "④" },
  { pa: "BIGF Common Skid",     label: "BIGF Skid",    icon: "⑤" },
  { pa: "BIGF Bioreactors",     label: "BIGF",         icon: "🧫" },
  { pa: "Stacking",             label: "Stacking",     icon: "⑥" },
  { pa: "Leaching",             label: "Leaching",     icon: "⑦" },
  { pa: "Raffinate",            label: "Raffinate",    icon: "⑩" },
  { pa: "PLS SX EW",            label: "PLS SX EW",    icon: "⑪" },
  { pa: "Scale Up Bioreactors", label: "Scale Up",     icon: "🔬" },
];

function statusColor(val: number | null, lo: number | null, hi: number | null): string {
  if (val === null) return "#484f58";
  if ((lo !== null && val < lo) || (hi !== null && val > hi)) return "#f85149";
  if (lo === null && hi === null) return "#484f58";
  return "#3fb950";
}

export function ProcessBar({
  onStepClick,
  highlighted,
  highlightedSet,
  multiSelect = false,
}: {
  onStepClick?: (pa: string) => void;
  highlighted?: string | null;
  highlightedSet?: Set<string>;
  multiSelect?: boolean;
}) {
  const { C } = useTheme();
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [hovered,  setHovered]  = useState<string | null>(null);

  useEffect(() => {
    // Load latest values + all profiles once, compute per-PA status
    Promise.all([api.latestValues(), api.allProfiles()]).then(([latest, profiles]) => {
      const valMap: Record<string, number | null> = {};
      for (const lv of latest) valMap[lv.Tag] = lv.Value;

      const result: Record<string, string> = {};
      for (const step of STEPS) {
        const stepProfiles = profiles.filter(
          p => p.PerformanceArea === step.pa && !p.IsCalculated
        );
        if (!stepProfiles.length) { result[step.pa] = "#484f58"; continue; }

        // Aggregate: any alarm → red, else any warn → amber, else green
        let worstColor = "#3fb950";
        for (const p of stepProfiles.slice(0, 6)) {
          const val = valMap[p.Tag] ?? null;
          const c = statusColor(val, p.LowerLimit, p.UpperLimit);
          if (c === "#f85149") { worstColor = "#f85149"; break; }
          if (c === "#d29922") worstColor = "#d29922";
        }
        result[step.pa] = worstColor;
      }
      setStatuses(result);
    }).catch(() => {});
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "0 12px",
      background: C.CARD2,
      borderBottom: `1px solid ${C.BORDER}`,
      flexShrink: 0,
      overflowX: "auto",
      scrollbarWidth: "none",
      height: 36,
      gap: 0,
    }}>
      {/* Label */}
      <span style={{
        fontSize: "0.6rem", fontWeight: 700, color: C.MUTED,
        letterSpacing: "0.08em", textTransform: "uppercase",
        marginRight: 8, whiteSpace: "nowrap", flexShrink: 0,
      }}>
        Process
      </span>
      {multiSelect && (
        <span style={{
          fontSize: "0.58rem", color: C.MUTED, marginRight: 8,
          whiteSpace: "nowrap", flexShrink: 0, fontStyle: "italic",
        }}>
          (click to toggle)
        </span>
      )}

      {STEPS.map((step, i) => {
        const dot    = statuses[step.pa] ?? "#484f58";
        const isHov  = hovered === step.pa;
        const isHigh = highlightedSet ? highlightedSet.has(step.pa) : highlighted === step.pa;
        const clickable = !!onStepClick;

        return (
          <div key={step.pa} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {/* Step pill */}
            <div
              onClick={() => onStepClick?.(step.pa)}
              onMouseEnter={() => setHovered(step.pa)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "3px 10px",
                borderRadius: 20,
                cursor: clickable ? "pointer" : "default",
                background: isHigh ? C.ACCENT + "22" : isHov ? C.ACCENT + "14" : "transparent",
                border: `1px solid ${isHigh ? C.ACCENT : isHov ? C.ACCENT + "55" : "transparent"}`,
                transition: "all 0.15s",
                whiteSpace: "nowrap",
                boxShadow: isHigh ? `0 0 8px ${C.ACCENT}44` : "none",
              }}
            >
              {/* Status dot */}
              <span style={{
                display: "inline-block",
                width: 7, height: 7,
                borderRadius: "50%",
                background: dot,
                boxShadow: dot !== "#484f58" ? `0 0 5px ${dot}88` : "none",
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: "0.7rem",
                fontWeight: isHigh || isHov ? 700 : 500,
                color: isHigh ? C.ACCENT : isHov ? C.ACCENT : C.TEXT,
              }}>
                {step.icon} {step.label}
              </span>
            </div>

            {/* Arrow — not after last */}
            {i < STEPS.length - 1 && (
              <span style={{ color: C.BORDER, fontSize: "0.7rem", padding: "0 2px", flexShrink: 0 }}>
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
