import { useEffect, useState } from "react";
import { useTheme } from "../theme";
import { api } from "../api";
import type { CommentRow } from "../types";

const CATEGORIES = [
  "Maintenance Issues",
  "Analysis & Comments",
  "Actions & Mitigations",
  "Learnings",
];

const CATEGORY_ICON: Record<string, string> = {
  "Maintenance Issues":    "🔧",
  "Analysis & Comments":   "📊",
  "Actions & Mitigations": "🛠️",
  "Learnings":             "💡",
};

export function CommentsPanel({ area, tags }: { area: string; tags?: string[] }) {
  const { C } = useTheme();
  const [comments,   setComments]   = useState<CommentRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [category,   setCategory]   = useState(CATEGORIES[0]);
  const [tag,        setTag]        = useState(tags?.[0] ?? "");
  const [text,       setText]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setTag(tags?.[0] ?? ""); }, [area, tags]);

  async function load() {
    setLoading(true); setError(null);
    try { setComments(await api.comments(area)); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [area]);

  async function handleAdd() {
    if (!text.trim()) return;
    setSubmitting(true); setError(null);
    try {
      await api.addComment({ area, category, text: text.trim(), tag_name: tag || undefined });
      setText("");
      await load();
    } catch (e) { setError(String(e)); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteComment(id, area);
      setComments(cs => cs.filter(c => c.id !== id));
    } catch (e) { setError(String(e)); }
  }

  const field: React.CSSProperties = {
    width: "100%", padding: "7px 9px", borderRadius: 6, boxSizing: "border-box",
    background: C.BG, color: C.TEXT, border: `1px solid ${C.BORDER}`,
    fontSize: "0.82rem", fontFamily: "inherit",
  };

  const disabled = submitting || !text.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Form */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.BORDER}`, flexShrink: 0 }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: C.TEXT, marginBottom: 10 }}>
          📝 Comments
        </div>

        {tags && tags.length > 0 && (
          <select value={tag} onChange={e => setTag(e.target.value)} style={{ ...field, marginBottom: 8 }}>
            {tags.map(t => <option key={t} value={t}>📍 {t}</option>)}
          </select>
        )}

        <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...field, marginBottom: 8 }}>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICON[c]} {c}</option>)}
        </select>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add an observation about this dashboard…"
          rows={3}
          style={{ ...field, resize: "vertical" }}
        />

        <button
          onClick={handleAdd}
          disabled={disabled}
          style={{
            marginTop: 8, width: "100%", padding: "8px 0", borderRadius: 6, border: "none",
            cursor: disabled ? "default" : "pointer",
            fontSize: "0.8rem", fontWeight: 700, color: "#fff",
            background: disabled ? C.MUTED : C.ACCENT,
            opacity: disabled ? 0.6 : 1,
          }}
        >
          {submitting ? "Adding…" : "Add Comment"}
        </button>

        {error && <div style={{ marginTop: 8, fontSize: "0.72rem", color: C.ALARM }}>{error}</div>}
      </div>

      {/* Comments list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {loading ? (
          <p style={{ color: C.MUTED, fontSize: "0.8rem" }}>Loading…</p>
        ) : comments.length === 0 ? (
          <p style={{ color: C.MUTED, fontSize: "0.8rem" }}>No comments yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {comments.map(c => (
              <div key={c.id} style={{
                background: C.CARD2, border: `1px solid ${C.BORDER}`,
                borderRadius: 8, padding: "10px 12px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{
                    fontSize: "0.62rem", fontWeight: 700, color: C.ACCENT,
                    border: `1px solid ${C.ACCENT}`, borderRadius: 999, padding: "1px 7px",
                  }}>
                    {CATEGORY_ICON[c.comment_category] || "💬"} {c.comment_category}
                  </span>
                  <button
                    onClick={() => handleDelete(c.id)}
                    title="Delete"
                    style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: C.MUTED }}
                  >
                    🗑️
                  </button>
                </div>
                {c.tag_name && c.tag_name !== "N/A" && (
                  <div style={{ fontSize: "0.64rem", color: C.MUTED, marginBottom: 6 }}>
                    🏷️ {c.tag_name}
                  </div>
                )}
                <p style={{ margin: 0, fontSize: "0.82rem", color: C.TEXT, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                  {c.comment_text}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: "0.64rem", color: C.MUTED }}>
                  {c.created_by} · {new Date(c.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
