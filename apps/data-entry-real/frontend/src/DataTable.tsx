import { useEffect, useMemo, useState } from 'react'
import type { TabDef } from './App'

interface Entry {
  stacking_date: string
  _tab_saves?: string
  [key: string]: any
}

interface Props {
  tabs: TabDef[]
}

const PRESETS = [
  { label: 'Last 7d',  days: 7   },
  { label: 'Last 30d', days: 30  },
  { label: 'Last 90d', days: 90  },
  { label: 'This year',days: -1  }, // special
  { label: 'All',      days: 0   }, // 0 = no filter
]

function toIso(d: Date) {
  return d.toISOString().slice(0, 10)
}

function defaultRange() {
  const to   = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 89) // 90 days inclusive
  return { from: toIso(from), to: toIso(to) }
}

export default function DataTable({ tabs }: Props) {
  const [rows, setRows]           = useState<Entry[]>([])
  const [loading, setLoading]     = useState(true)
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.id ?? '')
  const [activePreset, setActivePreset] = useState<number>(90)
  const [from, setFrom] = useState(defaultRange().from)
  const [to,   setTo  ] = useState(defaultRange().to)

  const load = () => {
    setLoading(true)
    fetch('/api/entries')
      .then(r => r.json())
      .then(data => { setRows(data); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // apply preset → update from/to
  const applyPreset = (days: number) => {
    setActivePreset(days)
    const now = new Date()
    if (days === 0) {
      setFrom('')
      setTo('')
    } else if (days === -1) {
      setFrom(`${now.getFullYear()}-01-01`)
      setTo(toIso(now))
    } else {
      const f = new Date()
      f.setDate(f.getDate() - (days - 1))
      setFrom(toIso(f))
      setTo(toIso(now))
    }
  }

  // manual range edit clears preset
  const handleFrom = (v: string) => { setFrom(v); setActivePreset(-99) }
  const handleTo   = (v: string) => { setTo(v);   setActivePreset(-99) }

  const filtered = useMemo(() =>
    rows.filter(r => {
      if (!r.stacking_date) return false
      if (from && r.stacking_date < from) return false
      if (to   && r.stacking_date > to)   return false
      return true
    }),
    [rows, from, to]
  )

  const currentTab  = tabs.find(t => t.id === activeTab)
  const tabCols     = currentTab?.fields.map(f => f.snake) ?? []
  const displayCols = ['stacking_date', ...tabCols]

  const tabSavesCount = (val: string | undefined) => {
    try { return Object.values(JSON.parse(val ?? '{}')).filter(Boolean).length }
    catch { return 0 }
  }

  const fmt = (v: any) => {
    if (v == null) return <span style={{ color: 'var(--border)' }}>—</span>
    if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    return String(v)
  }

  const colLabel = (col: string) => {
    const field = currentTab?.fields.find(f => f.snake === col)
    return field?.label ?? col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Inserted Records</h2>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {loading ? 'Loading…' : (
              <>
                <span style={{
                  fontWeight: 700,
                  color: filtered.length > 0 ? 'var(--accent)' : 'var(--muted)',
                }}>
                  {filtered.length}
                </span>
                {' '}of {rows.length} rows · {tabCols.length} cols shown
              </>
            )}
          </span>
        </div>

        {/* Preset chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
          {PRESETS.map(p => {
            const isActive = activePreset === p.days
            return (
              <button
                key={p.label}
                onClick={() => applyPreset(p.days)}
                style={{
                  padding: '4px 12px', fontSize: 12, borderRadius: 20,
                  background: isActive ? 'var(--accent)' : 'var(--surface2)',
                  color: isActive ? '#fff' : 'var(--muted)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Date range pickers */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="date"
            value={from}
            onChange={e => handleFrom(e.target.value)}
            style={{ width: 145, fontSize: 12 }}
          />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
          <input
            type="date"
            value={to}
            onChange={e => handleTo(e.target.value)}
            style={{ width: 145, fontSize: 12 }}
          />
          <button className="secondary" onClick={load} style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
            ↻
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: 'flex', gap: 4, flexWrap: 'wrap',
        borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 12,
      }}>
        {tabs.map(tab => {
          const saved = rows.filter(r => {
            try { return JSON.parse(r._tab_saves ?? '{}')[tab.id] } catch { return false }
          }).length
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 20,
                background: activeTab === tab.id ? 'var(--accent)' : 'var(--surface2)',
                color: activeTab === tab.id ? '#fff' : 'var(--muted)',
                border: `1px solid ${activeTab === tab.id ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: activeTab === tab.id ? 600 : 400,
              }}
            >
              {tab.label}
              <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>
                {tab.fields.length}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
            <thead>
              <tr>
                {displayCols.map(col => (
                  <th key={col} style={{
                    padding: '8px 12px', textAlign: 'left',
                    background: 'var(--surface2)', color: 'var(--muted)',
                    borderBottom: '2px solid var(--border)',
                    fontWeight: 600, fontSize: 11, letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    position: col === 'stacking_date' ? 'sticky' : undefined,
                    left: col === 'stacking_date' ? 0 : undefined,
                    zIndex: col === 'stacking_date' ? 1 : undefined,
                  }}>
                    {col === 'stacking_date' ? 'Date' : colLabel(col)}
                  </th>
                ))}
                <th style={{
                  padding: '8px 12px', textAlign: 'left',
                  background: 'var(--surface2)', color: 'var(--muted)',
                  borderBottom: '2px solid var(--border)',
                  fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                }}>
                  Tabs Saved
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={displayCols.length + 1} style={{
                    padding: 40, textAlign: 'center', color: 'var(--muted)',
                  }}>
                    No records in this range
                  </td>
                </tr>
              ) : filtered.map((row, i) => (
                <tr key={row.stacking_date} style={{
                  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                }}>
                  {displayCols.map(col => (
                    <td key={col} style={{
                      padding: '6px 12px',
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap',
                      background: col === 'stacking_date'
                        ? (i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)') : undefined,
                      position: col === 'stacking_date' ? 'sticky' : undefined,
                      left: col === 'stacking_date' ? 0 : undefined,
                      fontWeight: col === 'stacking_date' ? 600 : undefined,
                    }}>
                      {fmt(row[col])}
                    </td>
                  ))}
                  <td style={{
                    padding: '6px 12px', borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{
                      background: tabSavesCount(row._tab_saves) >= tabs.length
                        ? 'var(--success)' : 'var(--surface2)',
                      color: tabSavesCount(row._tab_saves) >= tabs.length ? '#fff' : 'var(--muted)',
                      border: `1px solid var(--border)`,
                      borderRadius: 10, padding: '2px 8px', fontSize: 11,
                    }}>
                      {tabSavesCount(row._tab_saves)}/{tabs.length}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
