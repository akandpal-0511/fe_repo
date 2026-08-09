import { useEffect, useState } from 'react'
import TabForm from './TabForm'
import DataTable from './DataTable'
import Charts from './Charts'

export interface FieldDef {
  snake: string
  label: string
  unit: string
  type: 'date' | 'number' | 'text'
  col?: string
  section?: string
  subsection?: string
}

export interface TabDef {
  id: string
  label: string
  fields: FieldDef[]
}

interface FormConfig {
  table: string
  join_key: string
  tabs: TabDef[]
}

const TODAY = new Date().toISOString().split('T')[0]
const VIEW_DATA   = '__data__'
const VIEW_CHARTS = '__charts__'

export default function App() {
  const [config, setConfig]       = useState<FormConfig | null>(null)
  const [date, setDate]           = useState(TODAY)
  const [activeTab, setActiveTab] = useState<string>('')
  const [rowData, setRowData]     = useState<Record<string, any>>({})
  const [tabSaves, setTabSaves]   = useState<Record<string, boolean>>({})
  const [saving, setSaving]       = useState(false)
  const [status, setStatus]       = useState('')
  const [dark, setDark]           = useState(false)
  const [allRows, setAllRows]     = useState<Record<string, any>[]>([])
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('banner_dismissed') === '1'
  )

  const dismissBanner = () => {
    localStorage.setItem('banner_dismissed', '1')
    setBannerDismissed(true)
  }
  const showBanner = () => {
    localStorage.removeItem('banner_dismissed')
    setBannerDismissed(false)
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then((cfg: FormConfig) => {
        const filtered = { ...cfg, tabs: cfg.tabs.filter(t => t.id !== 'general') }
        setConfig(filtered)
        setActiveTab(filtered.tabs[0]?.id ?? '')
      })
  }, [])

  const loadAllRows = () => {
    fetch('/api/entries')
      .then(r => r.json())
      .then(data => setAllRows(data))
      .catch(() => {})
  }

  useEffect(() => { loadAllRows() }, [])

  useEffect(() => {
    if (!date) return
    fetch(`/api/entries/${date}`)
      .then(r => r.status === 404 ? null : r.json())
      .then(data => {
        setRowData(data ?? {})
        try { setTabSaves(JSON.parse(data?._tab_saves ?? '{}')) }
        catch { setTabSaves({}) }
      })
  }, [date])

  const handleSave = async (tabId: string, fields: Record<string, any>) => {
    setSaving(true)
    setStatus('')
    try {
      const res = await fetch(`/api/entries/${date}/${tabId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Save failed')
      setRowData(body.entry ?? {})
      try { setTabSaves(JSON.parse(body.entry?._tab_saves ?? '{}')) } catch {}
      setStatus('Saved ✓')
    } catch (e: any) {
      setStatus(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!config) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading config…</div>

  const totalTabs = config.tabs.length
  const savedTabs = Object.values(tabSaves).filter(Boolean).length
  const pct       = Math.round((savedTabs / totalTabs) * 100)
  const isDataView   = activeTab === VIEW_DATA
  const isChartsView = activeTab === VIEW_CHARTS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* ── Info banner ── */}
      {!bannerDismissed && (
        <div style={{
          background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
          padding: '8px 24px', fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 12,
          color: 'var(--muted)',
        }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>How to use</span>
          <span>
            1. Pick a date &nbsp;·&nbsp;
            2. Select a section tab &nbsp;·&nbsp;
            3. Fill fields &nbsp;·&nbsp;
            4. <strong style={{ color: 'var(--text)' }}>Save Tab</strong> — each team saves their own section &nbsp;·&nbsp;
            5. Green dot = saved &nbsp;·&nbsp;
            6. <strong style={{ color: 'var(--text)' }}>Data</strong> tab to view all records
          </span>
          <button
            onClick={dismissBanner}
            style={{ background: 'transparent', color: 'var(--muted)', padding: '2px 6px',
                     fontSize: 13, border: '1px solid var(--border)', marginLeft: 'auto' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Top bar ── */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)', flexShrink: 0 }}>
          Physicals Entry
        </span>

        {/* Date picker — hidden when viewing data/charts */}
        {!isDataView && !isChartsView && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>Date</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{ width: 150 }}
            />
          </div>
        )}

        {/* Completeness bar */}
        {!isDataView && !isChartsView && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              flex: 1, height: 6, background: 'var(--surface2)',
              borderRadius: 3, overflow: 'hidden', maxWidth: 300,
            }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: pct === 100 ? 'var(--success)' : 'var(--accent)',
                transition: 'width 0.3s',
              }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {savedTabs}/{totalTabs} tabs saved for {date}
            </span>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {status && !isDataView && (
            <span style={{
              fontSize: 12,
              color: status.startsWith('Error') ? 'var(--warning)' : 'var(--success)',
            }}>
              {status}
            </span>
          )}
          {bannerDismissed && (
            <button
              className="secondary"
              onClick={showBanner}
              style={{ padding: '4px 10px', fontSize: 12 }}
              title="Show help"
            >
              ?
            </button>
          )}
          <button
            className="secondary"
            onClick={() => setDark(d => !d)}
            style={{ padding: '6px 10px', fontSize: 15 }}
            title="Toggle theme"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          width: 180, background: 'var(--surface)', borderRight: '1px solid var(--border)',
          padding: '12px 0', overflowY: 'auto', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Entry tabs */}
          {config.tabs.map(tab => {
            const saved    = !!tabSaves[tab.id]
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '10px 16px', borderRadius: 0,
                  background: isActive ? 'var(--surface2)' : 'transparent',
                  color: isActive ? 'var(--text)' : 'var(--muted)',
                  borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                  textAlign: 'left', fontSize: 13,
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: saved ? 'var(--success)' : 'var(--border)',
                }} />
                {tab.label}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
                  {tab.fields.length}
                </span>
              </button>
            )
          })}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />

          {/* Data view tab */}
          <button
            onClick={() => setActiveTab(VIEW_DATA)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '10px 16px', borderRadius: 0,
              background: isDataView ? 'var(--surface2)' : 'transparent',
              color: isDataView ? 'var(--text)' : 'var(--muted)',
              borderLeft: isDataView ? '3px solid var(--accent)' : '3px solid transparent',
              textAlign: 'left', fontSize: 13,
            }}
          >
            <span style={{ fontSize: 14 }}>⊞</span>
            Data
          </button>

          {/* Charts tab */}
          <button
            onClick={() => setActiveTab(VIEW_CHARTS)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '10px 16px', borderRadius: 0,
              background: isChartsView ? 'var(--surface2)' : 'transparent',
              color: isChartsView ? 'var(--text)' : 'var(--muted)',
              borderLeft: isChartsView ? '3px solid var(--accent)' : '3px solid transparent',
              textAlign: 'left', fontSize: 13,
            }}
          >
            <span style={{ fontSize: 14 }}>📈</span>
            Charts
          </button>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: isChartsView ? 'hidden' : 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column' }}>
          {isDataView ? (
            <DataTable
              tabs={config.tabs}
              rows={allRows}
              onRefresh={loadAllRows}
              onEditDate={(d) => { setDate(d); setActiveTab(config.tabs[0]?.id ?? '') }}
            />
          ) : isChartsView ? (
            <Charts tabs={config.tabs} rows={allRows} />
          ) : (
            config.tabs.map(tab => tab.id === activeTab && (
              <TabForm
                key={`${tab.id}-${date}`}
                tab={tab}
                initialValues={rowData}
                onSave={(fields) => handleSave(tab.id, fields)}
                saving={saving}
                alreadySaved={!!tabSaves[tab.id]}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
