import { useEffect, useState } from "react";
import { useTheme } from "../theme";
import { api } from "../api";
import type { KPICard, SelectedTag } from "../types";

function KPICardItem({ k, selected, onTagSelect }: { k: KPICard; selected: boolean; onTagSelect: (k: KPICard) => void }) {
  const { C } = useTheme();
  const [hovered, setHovered] = useState(false);
  const active = selected || hovered;
  return (
    <div
      onClick={() => onTagSelect(k)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Click to select for trend"
      style={{
        background: selected ? C.ACCENT + "18" : hovered ? C.CARD2 : C.CARD,
        border: `1px solid ${selected ? C.ACCENT + "88" : hovered ? C.ACCENT + "44" : C.BORDER}`,
        borderTop: `2px solid ${k.statusColor}`,
        borderRadius: 5,
        padding: "5px 8px 5px",
        minWidth: 90,
        flex: "1 1 90px",
        maxWidth: 160,
        cursor: "pointer",
        transition: "background 0.12s, border-color 0.12s",
        position: "relative",
      }}
    >
      {selected && (
        <span style={{
          position: "absolute", top: 4, right: 5,
          fontSize: "0.6rem", color: C.ACCENT, fontWeight: 700,
        }}>✓</span>
      )}
      <div style={{
        fontSize: "0.65rem",
        color: C.TEXT,
        textTransform: "uppercase",
        letterSpacing: "0.4px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        paddingRight: selected ? 12 : 0,
      }} title={k.description}>
        {k.description}
      </div>
      <div style={{
        fontSize: "1rem",
        fontWeight: 700,
        color: k.statusColor,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.3,
      }}>
        {k.formatted}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <div style={{ fontSize: "0.62rem", color: C.MUTED }}>
          ▼{k.lo !== null ? Math.round(k.lo) : "—"}&nbsp;
          ▲{k.hi !== null ? Math.round(k.hi) : "—"}&nbsp;
          {k.unit}
        </div>
        <span style={{
          fontSize: "0.62rem",
          color: active ? C.ACCENT : C.MUTED,
          fontWeight: active ? 600 : 400,
          transition: "color 0.12s",
        }}>
          {selected ? "Selected" : "Trend →"}
        </span>
      </div>
    </div>
  );
}

interface Props {
  area: string;
  onTagsSelect: (tags: SelectedTag[]) => void;
}

export function KPIStrip({ area, onTagsSelect }: Props) {
  const { C } = useTheme();
  const [kpis, setKpis] = useState<KPICard[]>([]);
  const [selSet, setSelSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.kpis(area).then(setKpis).catch(() => setKpis([]));
    setSelSet(new Set());
  }, [area]);

  if (kpis.length === 0) return null;

  function toggleTag(k: KPICard) {
    setSelSet((prev) => {
      const next = new Set(prev);
      next.has(k.tag) ? next.delete(k.tag) : next.add(k.tag);
      return next;
    });
  }

  function handleViewTrends() {
    const tags = kpis
      .filter((k) => selSet.has(k.tag))
      .map((k) => ({ tag: k.tag, desc: k.description }));
    onTagsSelect(tags);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionHeader>Key Performance Indicators</SectionHeader>
        {selSet.size > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", paddingBottom: 3 }}>
            <button
              onClick={() => setSelSet(new Set())}
              style={{
                background: "none", border: "none", color: C.MUTED,
                fontSize: "0.65rem", cursor: "pointer", padding: "2px 6px",
              }}
            >
              Clear
            </button>
            <button
              onClick={handleViewTrends}
              style={{
                background: C.ACCENT + "22", border: `1px solid ${C.ACCENT}66`,
                color: C.ACCENT, borderRadius: 4,
                fontSize: "0.7rem", fontWeight: 600, cursor: "pointer", padding: "3px 10px",
              }}
            >
              📈 View {selSet.size} Trend{selSet.size > 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {kpis.map((k) => (
          <KPICardItem
            key={k.tag}
            k={k}
            selected={selSet.has(k.tag)}
            onTagSelect={toggleTag}
          />
        ))}
      </div>
    </div>
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  const { C } = useTheme();
  return (
    <div style={{
      fontSize: "0.58rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "1.5px",
      color: C.ACCENT,
      borderBottom: `1px solid ${C.BORDER}`,
      paddingBottom: 3,
      margin: "10px 0 5px",
      display: "flex",
      alignItems: "center",
      gap: 5,
    }}>
      <span style={{
        display: "inline-block",
        width: 3,
        height: 10,
        background: C.ACCENT,
        borderRadius: 2,
        flexShrink: 0,
      }} />
      {children}
    </div>
  );
}
