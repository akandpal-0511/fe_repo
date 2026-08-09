import { useMemo, useState, useRef, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { TabDef, FieldDef } from './App'

interface Props {
  tabs: TabDef[]
  rows: Record<string, any>[]
}

const COLORS = ['#e04b2a', '#2196f3', '#4caf50', '#ff9800', '#9c27b0']
const MAX_METRICS = 5

const PRESETS = [
  { label: 'Last 7d',  days: 7  },
  { label: 'Last 30d', days: 30 },
  { label: 'Last 90d', days: 90 },
  { label: 'This year',days: -1 },
  { label: 'All',      days: 0  },
]

function toIso(d: Date) { return d.toISOString().slice(0, 10) }

function defaultRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 89)
  return { from: toIso(from), to: toIso(to) }
}

export default function Charts({ tabs, rows }: Props) {
  const [selected, setSelected]         = useState<FieldDef[]>([])
  const [search, setSearch]             = useState('')
  const [dropOpen, setDropOpen]         = useState(false)
  const [activePreset, setActivePreset] = useState(0)
  const [from, setFrom]                 = useState('')
  const [to,   setTo  ]                 = useState('')
  const [tabFilter, setTabFilter]       = useState<string>('All')
  const dropRef = useRef<HTMLDivElement>(null)

  // close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const applyPreset = (days: number) => {
    setActivePreset(days)
    const now = new Date()
    if (days === 0) { setFrom(''); setTo('') }
    else if (days === -1) { setFrom(`${now.getFullYear()}-01-01`); setTo(toIso(now)) }
    else {
      const f = new Date(); f.setDate(f.getDate() - (days - 1))
      setFrom(toIso(f)); setTo(toIso(now))
    }
  }

  // all numeric fields across all tabs
  const allFields = useMemo(() =>
    tabs.flatMap(tab =>
      tab.fields
        .filter(f => f.type === 'number')
        .map(f => ({ ...f, _tabLabel: tab.label }))
    ),
    [tabs]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allFields.filter(f => {
      if (tabFilter !== 'All' && (f as any)._tabLabel !== tabFilter) return false
      return !q || f.label.toLowerCase().includes(q) ||
        (f.subsection ?? '').toLowerCase().includes(q) ||
        (f as any)._tabLabel.toLowerCase().includes(q)
    })
  }, [allFields, search, tabFilter])

  // group filtered fields by tab
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const f of filtered) {
      const key = (f as any)._tabLabel
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(f)
    }
    return Array.from(map.entries())
  }, [filtered])

  const toggleField = (field: FieldDef) => {
    setSelected(prev => {
      const exists = prev.find(f => f.snake === field.snake)
      if (exists) return prev.filter(f => f.snake !== field.snake)
      if (prev.length >= MAX_METRICS) return prev
      return [...prev, field]
    })
  }

  // filter rows by date range
  const chartData = useMemo(() =>
    rows
      .filter(r => {
        if (!r.stacking_date) return false
        if (from && r.stacking_date < from) return false
        if (to   && r.stacking_date > to)   return false
        return true
      })
      .sort((a, b) => a.stacking_date.localeCompare(b.stacking_date))
      .map(r => {
        const point: Record<string, any> = { date: r.stacking_date }
        for (const f of selected) {
          const v = r[f.snake]
          point[f.snake] = v != null ? Number(v) : null
        }
        return point
      }),
    [rows, from, to, selected]
  )

  const colLabel = (field: FieldDef) =>
    field.subsection && field.subsection !== field.section
      ? `${field.subsection} — ${field.label}`
      : field.label

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Charts</h2>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {selected.length === 0
              ? 'Select up to 5 metrics to plot'
              : `${selected.length} metric${selected.length > 1 ? 's' : ''} · ${chartData.length} data points`}
          </span>
        </div>

        {/* Preset chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
          {PRESETS.map(p => {
            const isActive = activePreset === p.days
            return (
              <button key={p.label} onClick={() => applyPreset(p.days)} style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 20,
                background: isActive ? 'var(--accent)' : 'var(--surface2)',
                color: isActive ? '#fff' : 'var(--muted)',
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: isActive ? 600 : 400, cursor: 'pointer',
              }}>
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Date range */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActivePreset(-99) }}
            style={{ width: 145, fontSize: 12 }} />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>→</span>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setActivePreset(-99) }}
            style={{ width: 145, fontSize: 12 }} />
        </div>
      </div>

      {/* Tab filter bar */}
      <div style={{
        display: 'flex', gap: 4, flexWrap: 'wrap',
        borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 12,
      }}>
        {['All', ...tabs.map(t => t.label)].map(label => {
          const isActive  = tabFilter === label
          const hasSelected = label === 'All'
            ? selected.length > 0
            : selected.some(s => allFields.find(f => f.snake === s.snake)?._tabLabel === label)
          return (
            <button
              key={label}
              onClick={() => { setTabFilter(label); setSearch('') }}
              style={{
                padding: '4px 12px', fontSize: 12, borderRadius: 20,
                background: isActive ? 'var(--accent)' : 'var(--surface2)',
                color: isActive ? '#fff' : 'var(--muted)',
                border: `1px solid ${isActive ? 'var(--accent)' : hasSelected ? 'var(--accent)' : 'var(--border)'}`,
                fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {label}
              {hasSelected && !isActive && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--accent)', flexShrink: 0,
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Metric picker */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap' }}>

        {/* Dropdown */}
        <div ref={dropRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDropOpen(o => !o)}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 6,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap',
              opacity: selected.length >= MAX_METRICS ? 0.5 : 1,
            }}
          >
            + Add metric {selected.length > 0 ? `(${selected.length}/${MAX_METRICS})` : ''}
          </button>

          {dropOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 100,
              width: 320, maxHeight: 380, overflowY: 'auto',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              marginTop: 4,
            }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search metrics…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                />
              </div>
              {grouped.map(([tabLabel, fields]) => (
                <div key={tabLabel}>
                  <div style={{
                    padding: '6px 12px', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--muted)', background: 'var(--surface2)',
                  }}>
                    {tabLabel}
                  </div>
                  {fields.map(f => {
                    const isSelected = !!selected.find(s => s.snake === f.snake)
                    const disabled   = !isSelected && selected.length >= MAX_METRICS
                    return (
                      <div
                        key={f.snake}
                        onClick={() => !disabled && toggleField(f)}
                        style={{
                          padding: '7px 12px', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
                          background: isSelected ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                          color: disabled ? 'var(--border)' : 'var(--text)',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}
                      >
                        <span style={{
                          width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                          background: isSelected
                            ? COLORS[selected.findIndex(s => s.snake === f.snake)]
                            : 'var(--border)',
                        }} />
                        {colLabel(f)}
                      </div>
                    )
                  })}
                </div>
              ))}
              {grouped.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  No metrics found
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected chips */}
        {selected.map((f, i) => (
          <span key={f.snake} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 20, fontSize: 12,
            background: 'color-mix(in srgb, var(--accent) 10%, var(--surface2))',
            border: `1px solid ${COLORS[i]}`,
            color: 'var(--text)',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i], flexShrink: 0 }} />
            {colLabel(f)}
            <button onClick={() => toggleField(f)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', padding: 0, fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </span>
        ))}
      </div>

      {/* Chart */}
      {selected.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted)', fontSize: 14, border: '2px dashed var(--border)',
          borderRadius: 8,
        }}>
          Select metrics above to plot a chart
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--muted)' }}
                tickFormatter={v => v.slice(5)} // show MM-DD
              />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} width={60} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 6, fontSize: 12,
                }}
                labelStyle={{ fontWeight: 700, marginBottom: 4 }}
                formatter={(value: any, name: any) => {
                  const field = selected.find(f => f.snake === String(name))
                  return [
                    value != null ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—',
                    field ? colLabel(field) : String(name),
                  ]
                }}
              />
              <Legend
                formatter={(value) => {
                  const field = selected.find(f => f.snake === value)
                  return field ? colLabel(field) : value
                }}
                wrapperStyle={{ fontSize: 12 }}
              />
              {selected.map((f, i) => (
                <Line
                  key={f.snake}
                  type="monotone"
                  dataKey={f.snake}
                  stroke={COLORS[i]}
                  strokeWidth={2}
                  dot={chartData.length <= 60}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
