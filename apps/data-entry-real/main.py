"""
data-entry-real backend.
Schema is driven by apps/data-entry-real/config/form_config.json — no hardcoded fields.
Delta table: serverless_stable_82bi8w_catalog.data_entry.nuton_load_daily_real
"""
import json
import logging
import math
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import requests as _requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)

# ── config ────────────────────────────────────────────────────────────────────

_HERE       = Path(__file__).parent
_CONFIG     = json.loads((_HERE / "config" / "form_config.json").read_text())
_SQL_DIR    = Path(__file__).parent.parent.parent / "sql"

CATALOG     = "serverless_stable_82bi8w_catalog"
SCHEMA      = "data_entry"
TABLE       = "nuton_load_daily_real"
FULL        = f"{CATALOG}.{SCHEMA}.{TABLE}"
VIEW_FULL   = f"{CATALOG}.{SCHEMA}.daily_report"

_ALL_FIELDS = [f["snake"] for tab in _CONFIG["tabs"] for f in tab["fields"]]
_TAB_IDS    = [tab["id"] for tab in _CONFIG["tabs"]]

# ── Delta auth (same pattern as data-entry app) ───────────────────────────────

_token_cache: dict = {}


def _get_token() -> str | None:
    # On Databricks Apps, DATABRICKS_TOKEN is auto-injected by the platform
    env_token = os.environ.get("DATABRICKS_TOKEN", "")
    if env_token:
        return env_token
    # Local dev: use CLI profile
    now = time.time()
    if _token_cache.get("token") and _token_cache.get("expires_at", 0) > now + 60:
        return _token_cache["token"]
    try:
        result = subprocess.run(
            ["databricks", "auth", "token", "--profile", "fevm-stable"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            logger.warning("CLI token failed: %s", result.stderr.strip())
            return None
        data = json.loads(result.stdout)
        token = data.get("access_token")
        _token_cache["token"] = token
        _token_cache["expires_at"] = now + data.get("expires_in", 3600)
        return token
    except Exception as exc:
        logger.warning("Token error: %s", exc)
        return None


def _exec(sql: str) -> list[dict] | None:
    warehouse_id = os.environ.get("DATABRICKS_WAREHOUSE_ID", "")
    host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
    token = _get_token()
    if not all([warehouse_id, host, token]):
        logger.warning("Delta not available (missing warehouse/host/token)")
        return None
    try:
        resp = _requests.post(
            f"{host}/api/2.0/sql/statements",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"statement": sql, "warehouse_id": warehouse_id, "wait_timeout": "50s"},
            timeout=60,
        )
        if resp.status_code != 200:
            logger.warning("SQL HTTP %s: %s | SQL: %.80s", resp.status_code, resp.text[:120], sql)
            return None
        body = resp.json()
        if body.get("status", {}).get("state") != "SUCCEEDED":
            logger.warning("SQL state=%s: %.120s", body.get("status", {}).get("state"), sql)
            return None
        data_array = (body.get("result") or {}).get("data_array") or []
        if not data_array:
            return []
        cols = [c["name"] for c in body["manifest"]["schema"]["columns"]]
        return [_coerce(dict(zip(cols, row))) for row in data_array]
    except Exception as exc:
        logger.warning("SQL exec error: %s", exc)
        return None


def _coerce(row: dict) -> dict:
    str_cols = {"stacking_date", "_submitted_by", "_submitted_at", "_tab_saves"}
    out: dict = {}
    for k, v in row.items():
        if v is None or v == "":
            out[k] = None
        elif k in str_cols or k.startswith("_"):
            out[k] = v
        else:
            try:
                f = float(v)
                out[k] = None if (math.isnan(f) or math.isinf(f)) else f
            except (ValueError, TypeError):
                out[k] = v
    return out


def _lit(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, float):
        return "NULL" if (math.isnan(v) or math.isinf(v)) else repr(v)
    if isinstance(v, (int, bool)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


# ── startup: ensure schema + table + view ─────────────────────────────────────

def _ensure_infra():
    _exec(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")

    # Read and run DDL
    ddl_path = _SQL_DIR / "nuton_load_daily_real_ddl.sql"
    if ddl_path.exists():
        for stmt in ddl_path.read_text().split(";"):
            stmt = stmt.strip()
            if stmt:
                _exec(stmt)

    # Read and run view SQL
    view_path = _SQL_DIR / "daily_report_view.sql"
    if view_path.exists():
        _exec(view_path.read_text().rstrip(";"))

    logger.info("Delta infrastructure ready")


_infra_ready = False

def _lazy_ensure_infra():
    global _infra_ready
    if not _infra_ready and _get_token():
        _ensure_infra()
        _infra_ready = True

# ── store operations ──────────────────────────────────────────────────────────

def _upsert_tab(stacking_date: str, tab_id: str, fields: dict, submitted_by: str) -> bool:
    """Partial MERGE — only updates columns belonging to this tab, plus audit fields."""
    tab_fields = next((t["fields"] for t in _CONFIG["tabs"] if t["id"] == tab_id), [])
    tab_snakes = {f["snake"] for f in tab_fields}

    # Current tab_saves JSON
    existing = _get_row(stacking_date)
    tab_saves = {}
    if existing:
        try:
            tab_saves = json.loads(existing.get("_tab_saves") or "{}")
        except Exception:
            tab_saves = {}
    tab_saves[tab_id] = True
    tab_saves_str = json.dumps(tab_saves)

    import datetime
    now_str = datetime.datetime.now().isoformat()

    # Build column list for this tab only
    cols = ["stacking_date"] + [s for s in _ALL_FIELDS if s in tab_snakes] + \
           ["_submitted_by", "_submitted_at", "_tab_saves"]

    vals = {
        "stacking_date":  stacking_date,
        "_submitted_by":  submitted_by,
        "_submitted_at":  now_str,
        "_tab_saves":     tab_saves_str,
        **{s: fields.get(s) for s in _ALL_FIELDS if s in tab_snakes},
    }

    select_exprs = ", ".join(f"{_lit(vals.get(c))} AS `{c}`" for c in cols)
    update_set   = ", ".join(f"t.`{c}` = s.`{c}`" for c in cols if c != "stacking_date")
    col_list     = ", ".join(f"`{c}`" for c in cols)
    val_list     = ", ".join(f"s.`{c}`" for c in cols)

    sql = f"""
MERGE INTO {FULL} AS t
USING (SELECT {select_exprs}) AS s
ON t.stacking_date = s.stacking_date
WHEN MATCHED THEN UPDATE SET {update_set}
WHEN NOT MATCHED THEN INSERT ({col_list}) VALUES ({val_list})
"""
    return _exec(sql) is not None


def _get_row(stacking_date: str) -> dict | None:
    rows = _exec(f"SELECT * FROM {FULL} WHERE stacking_date = {_lit(stacking_date)}")
    return rows[0] if rows else None


def _list_rows(limit: int = 60, offset: int = 0) -> list[dict]:
    rows = _exec(f"SELECT * FROM {FULL} ORDER BY stacking_date DESC LIMIT {limit} OFFSET {offset}")
    return rows or []


# ── FastAPI ───────────────────────────────────────────────────────────────────

app = FastAPI(title="Physicals Data Entry (Real)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _current_user(request: Request) -> str:
    h = request.headers
    return h.get("X-Forwarded-Preferred-Username") or h.get("X-Forwarded-Email") or "operator"


@app.get("/api/config")
def api_config():
    """Return form config (tabs + fields) for the frontend to render dynamically."""
    _lazy_ensure_infra()
    return _CONFIG


@app.get("/api/entries")
def api_list(limit: int = 60, offset: int = 0):
    _lazy_ensure_infra()
    return _list_rows(limit=limit, offset=offset)


@app.get("/api/entries/{stacking_date}")
def api_get(stacking_date: str):
    _lazy_ensure_infra()
    row = _get_row(stacking_date)
    if row is None:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return row


@app.post("/api/entries/{stacking_date}/{tab_id}")
async def api_save_tab(stacking_date: str, tab_id: str, request: Request):
    """Save a single tab's fields for a given date."""
    if tab_id not in _TAB_IDS:
        return JSONResponse({"error": f"Unknown tab: {tab_id}"}, status_code=400)
    body = await request.json()
    ok = _upsert_tab(stacking_date, tab_id, body, _current_user(request))
    if not ok:
        return JSONResponse({"error": "Delta write failed"}, status_code=500)
    row = _get_row(stacking_date)
    return {"status": "ok", "entry": row}


@app.delete("/api/entries/{stacking_date}")
def api_delete(stacking_date: str):
    ok = _exec(f"DELETE FROM {FULL} WHERE stacking_date = {_lit(stacking_date)}") is not None
    if not ok:
        return JSONResponse({"error": "Delete failed"}, status_code=500)
    return {"status": "ok", "deleted": stacking_date}


# ── serve React frontend ──────────────────────────────────────────────────────

_dist = _HERE / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
else:
    @app.get("/")
    def root():
        return {"message": "Run: cd apps/data-entry-real/frontend && npm run build"}
