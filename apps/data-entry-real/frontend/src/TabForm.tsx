import { useEffect, useMemo, useState } from 'react'
import type { TabDef } from './App'

interface Props {
  tab: TabDef
  initialValues: Record<string, any>
  onSave: (fields: Record<string, any>) => void
  saving: boolean
  alreadySaved: boolean
}

export default function TabForm({ tab, initialValues, onSave, saving, alreadySaved }: Props) {
  const [values, setValues] = useState<Record<string, any>>({})
  const [dirty, setDirty]   = useState(false)

  // Seed form from existing row when date/tab changes
  useEffect(() => {
    const seed: Record<string, any> = {}
    for (const f of tab.fields) {
      const v = initialValues[f.snake]
      seed[f.snake] = v != null ? v : ''
    }
    setValues(seed)
    setDirty(false)
  }, [tab.id, initialValues])

  const set = (snake: string, val: string) => {
    setValues(prev => ({ ...prev, [snake]: val }))
    setDirty(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Convert empty strings to null, numbers to float
    const payload: Record<string, any> = {}
    for (const f of tab.fields) {
      const raw = values[f.snake]
      if (raw === '' || raw == null) {
        payload[f.snake] = null
      } else if (f.type === 'number') {
        const n = parseFloat(raw)
        payload[f.snake] = isNaN(n) ? null : n
      } else {
        payload[f.snake] = raw
      }
    }
    onSave(payload)
    setDirty(false)
  }

  // Group fields by subsection for visual grouping
  const groups = useMemo(() => {
    const map: Map<string, typeof tab.fields> = new Map()
    for (const f of tab.fields) {
      const key = f.subsection || f.section || ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(f)
    }
    return Array.from(map.entries())
  }, [tab.fields])

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tab.label}</h2>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{tab.fields.length} fields</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {alreadySaved && !dirty && (
            <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Saved</span>
          )}
          {dirty && (
            <span style={{ fontSize: 12, color: 'var(--warning)' }}>Unsaved changes</span>
          )}
          <button
            type="submit"
            className="primary"
            disabled={saving || (!dirty && alreadySaved)}
          >
            {saving ? 'Saving…' : alreadySaved && !dirty ? 'Saved' : 'Save Tab'}
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '12px 20px',
        alignItems: 'start',
      }}>
        {groups.map(([groupName, fields]) => (
          <>
            {/* Full-width divider only for sections with 3+ fields */}
            {groupName && fields.length >= 3 && (
              <div key={`hdr-${groupName}`} style={{
                gridColumn: '1 / -1',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--muted)',
                borderBottom: '1px solid var(--border)',
                paddingBottom: 6, marginTop: 16,
              }}>
                {groupName}
              </div>
            )}
            {fields.map(f => (
              <div key={f.snake}>
                <label style={{
                  display: 'block', fontSize: 11, color: 'var(--muted)',
                  marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }} title={`${groupName ? groupName + ' — ' : ''}${f.label}`}>
                  {f.label}
                </label>
                <input
                  type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                  step={f.type === 'number' ? 'any' : undefined}
                  value={values[f.snake] ?? ''}
                  onChange={e => set(f.snake, e.target.value)}
                  placeholder={undefined}
                />
              </div>
            ))}
          </>
        ))}
      </div>
    </form>
  )
}
