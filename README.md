# Nuton Ops App — Local Setup

## Prerequisites (install once)

| Tool | Why |
|---|---|
| Python 3.12 | Backend runtime — other versions may break databricks-sql-connector |
| Node.js + npm | Frontend build |
| Databricks CLI | Auth (~/.databrickscfg) |

---

## Step 1 — Databricks Auth

They need access to the workspace and a configured profile:

- Host: `https://dbc-333c1e01-9df1.cloud.databricks.com`
- Either via `databricks configure` or copy your `~/.databrickscfg`

Without this, every API call fails — `Config()` in `db.py` reads from that file automatically.

---

## Step 2 — Python environment + dependencies

```bash
cd apps/nuton-ops-app-react

# Must be Python 3.12 specifically
python3.12 -m venv venv
source venv/bin/activate        # Mac/Linux
# OR: venv\Scripts\activate     # Windows

# If on corporate/Databricks network, direct PyPI is blocked — use proxy:
pip install -r requirements.txt --index-url https://pypi-proxy.dev.databricks.com/simple

# If not on corporate network, plain pip works:
# pip install -r requirements.txt
```

---

## Step 3 — Build the React frontend (one-time)

```bash
cd frontend

# If on corporate/Databricks network, npm registry is blocked — set proxy first:
npm config set registry https://npm-proxy.dev.databricks.com/

npm install
npm run build
cd ..
```

This creates `frontend/dist/` which the backend serves at `/`.

---

## Step 4 — Run the backend

```bash
# from apps/nuton-ops-app-react/
DATABRICKS_WAREHOUSE_ID=ece0f25e3cd350d3 uvicorn main:app --reload --port 8000
```

If uvicorn is not on PATH (common if installed inside a venv), use the full path:

```bash
DATABRICKS_WAREHOUSE_ID=ece0f25e3cd350d3 /path/to/venv/bin/uvicorn main:app --reload --port 8000
```

Wait for: `Application startup complete.`

---

## Step 5 — (Optional) Run frontend in dev mode

Only needed if editing React code. Otherwise `frontend/dist` is already served by the backend at `http://localhost:8000`.

```bash
cd frontend
npm run dev
# open http://localhost:5173
```

---

## Summary — two modes

| Mode | What to run | URL |
|---|---|---|
| Production-like (just the app) | Only Step 4 | http://localhost:8000 |
| Dev mode (editing frontend) | Steps 4 + 5 in separate terminals | http://localhost:5173 |

---

# Architecture — How Data Flows

## End to end

```
Databricks SQL (Silver/Gold tables)
    ↓  db.py        (sqlQuery + TTL cache)
    ↓  main.py      (FastAPI routes)
    ↓  HTTP GET /api/...
    ↓  api.ts       (fetch wrapper)
    ↓  Tab component (useState + useEffect)
    ↓  Plotly / custom chart
```

---

## Layer 1 — `db.py` — talks to Databricks

**`sqlQuery()`** — opens a Databricks SQL connection using the warehouse ID from env var, runs the query, returns a pandas DataFrame.

**`@ttl_cache(3600)`** — a simple in-memory cache (dict + lock). Results are reused for 1 hour so every page load doesn't hammer the warehouse. Cache clears on `/api/cache/clear`.

| Function | What it fetches |
|---|---|
| `getAllTagProfiles()` | The sensor metadata table — description, unit, limits, data source |
| `getAllLatestValues()` | Most recent reading per tag (last 6 hours) from the silver historian table |
| `getTrendData(tags, start, end)` | Time-series rows for a list of tags over a date range |
| `getGoldLatestRow(table)` | Latest weekly aggregate row from a gold table |

`getTrendData` is smart — it checks each tag's `DataSource`. Historian tags go to the silver table. Non-historian tags (Gunnison Excel, irrigation flow, stacking progress) go to different tables via a `DATASOURCE_TABLE_MAP` lookup.

---

## Layer 2 — `main.py` — FastAPI routes

Wraps the db functions as HTTP endpoints. Also:
- Sanitises `NaN`/`Inf` floats before JSON serialisation (Databricks sometimes returns these)
- Converts DataFrames to `list[dict]` via `_df_to_records()`
- Serves the built React app as static files from `frontend/dist/` (so it's one single process)

| Route | What it returns |
|---|---|
| `GET /api/tag-profiles` | All sensor metadata |
| `GET /api/trends?tags=...&start=...&end=...` | Time-series data |
| `GET /api/latest-values` | Snapshot of current readings |
| `GET /api/kpis/{area}` | Computed KPI cards (value + colour) for the strip at the top |
| `GET /api/flowsheet/{area}` | A full Plotly figure JSON built server-side |

---

## Layer 3 — `api.ts` — thin fetch wrapper

Just one function: `get<T>(path)` — does `fetch(path)`, checks for HTTP errors, returns parsed JSON. Every endpoint is a one-liner wrapping that.

Because the React app is served from the same origin as the FastAPI backend, paths like `/api/trends` just work — no CORS needed in prod (though CORS middleware is there for local dev).

---

## Layer 4 — Tab component — React

Pattern is the same in every tab:

```tsx
const [data, setData] = useState(null);

useEffect(() => {
    api.allProfiles().then(setData);  // fires once on mount
}, []);

async function handleLoad() {
    const rows = await api.trends(tags, start, end);
    // transform rows → Plotly trace format
    setFigure([{ type: "scatter", x: [...], y: [...] }]);
}
```

1. On mount → fetch profiles (cached in backend, fast)
2. User picks date range / tags → clicks button
3. `api.trends()` fires → backend queries silver table → returns `[{Tag, Timestamp_AZ, Value}]`
4. Component pivots/transforms those rows into Plotly `data` array
5. `<Plot data={figure} layout={...} />` renders it

---

## Concrete example — Sensor Trends tab

```
User selects "Crushing" + date range → clicks "Load"
  → api.trends(["tag1","tag2"], "2026-05-04", "2026-05-11")
  → GET /api/trends?tags=tag1,tag2&start=...&end=...
  → getTrendData(("tag1","tag2"), ...) in db.py
  → sqlQuery("SELECT Tag, Timestamp_AZ, Value FROM silver_table WHERE Tag IN (...)")
  → returns ~10k rows as DataFrame
  → _df_to_records() → JSON list
  → api.ts parses JSON → TrendPoint[]
  → component groups rows by Tag → one Plotly line per tag
  → chart renders
```

The whole round-trip is typically 1–3 seconds — most of that is the warehouse query. The tag profiles call is usually instant because it's cached.
