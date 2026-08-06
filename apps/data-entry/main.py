import math
import json
import logging
import datetime as _dt
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ── workspace file store ──────────────────────────────────────────────────────
# On Databricks: persists to /Users/<user>/fe_data_entry/nuton_load.json
# Locally: falls back to a local file in data/

_WS_PATH = "/Users/ashutosh.kandpal@databricks.com/fe_data_entry/nuton_load.json"
_LOCAL_PATH = Path(__file__).parent / "data" / "nuton_load.json"
_EXCEL = Path(__file__).parent / "data" / "synthetic_physicals_master.xlsx"

# use Databricks workspace files API when DATABRICKS_HOST + token are available
import os, requests as _requests

_DB_HOST  = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
_DB_TOKEN = os.environ.get("DATABRICKS_TOKEN", "")
_USE_WS   = bool(_DB_HOST and _DB_TOKEN)

if _USE_WS:
    logger.info(f"Databricks host detected — using workspace file store at {_WS_PATH}")
else:
    logger.info("No Databricks credentials — using local file store")


def _clean(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def _rows_from_excel() -> list[dict]:
    if not _EXCEL.exists():
        return []
    df = pd.read_excel(_EXCEL, sheet_name="Nuton Load", engine="openpyxl")
    df["report_date"] = pd.to_datetime(df["report_date"]).dt.strftime("%Y-%m-%d")
    records = df.where(pd.notna(df), None).to_dict(orient="records")
    return [{k: _clean(v) for k, v in row.items()} for row in records]


def _ws_headers() -> dict:
    return {"Authorization": f"Bearer {_DB_TOKEN}", "Content-Type": "application/json"}


def _read_store() -> list[dict]:
    """Load rows from workspace file, local file, or Excel seed — in that order."""
    if _USE_WS:
        try:
            r = _requests.get(
                f"{_DB_HOST}/api/2.0/workspace/export",
                headers=_ws_headers(),
                params={"path": _WS_PATH, "format": "AUTO", "direct_download": "true"},
                timeout=10,
            )
            if r.status_code == 200:
                return json.loads(r.text)
            logger.warning(f"Workspace file not found (status {r.status_code}), seeding from Excel")
        except Exception as e:
            logger.warning(f"Workspace read failed: {e}")

    if _LOCAL_PATH.exists():
        try:
            return json.loads(_LOCAL_PATH.read_text())
        except Exception:
            pass

    # first run — seed from Excel then persist
    rows = _rows_from_excel()
    _write_store(rows)
    return rows


def _write_store(rows: list[dict]):
    """Persist rows to workspace file (on Databricks) or local file."""
    import base64
    payload = json.dumps(rows, default=str)
    if _USE_WS:
        try:
            encoded = base64.b64encode(payload.encode()).decode()
            r = _requests.post(
                f"{_DB_HOST}/api/2.0/workspace/import",
                headers=_ws_headers(),
                json={"path": _WS_PATH, "format": "AUTO", "overwrite": True, "content": encoded},
                timeout=10,
            )
            if r.status_code == 200:
                return
            logger.warning(f"Workspace write failed ({r.status_code}): {r.text}, falling back to local")
        except Exception as e:
            logger.warning(f"Workspace write exception: {e}, falling back to local")

    _LOCAL_PATH.parent.mkdir(parents=True, exist_ok=True)
    _LOCAL_PATH.write_text(payload)


# load on startup
_rows: list[dict] = _read_store()
_next_id: int = max((r.get("_id", 0) for r in _rows), default=0) + 1


def _get_all(limit: int = 100, offset: int = 0) -> list[dict]:
    sorted_rows = sorted(_rows, key=lambda r: r.get("report_date", ""), reverse=True)
    return sorted_rows[offset: offset + limit]


def _get_by_date(report_date: str) -> Optional[dict]:
    for row in _rows:
        if row.get("report_date") == report_date:
            return row
    return None


def _upsert(entry: dict) -> dict:
    global _next_id
    for i, row in enumerate(_rows):
        if row.get("report_date") == entry["report_date"]:
            _rows[i] = entry
            _write_store(_rows)
            return entry
    entry["_id"] = _next_id
    _next_id += 1
    _rows.append(entry)
    _write_store(_rows)
    return entry


def _delete(report_date: str) -> bool:
    global _rows
    before = len(_rows)
    _rows = [r for r in _rows if r.get("report_date") != report_date]
    if len(_rows) < before:
        _write_store(_rows)
        return True
    return False


def _derive(entry: dict) -> dict:
    """Auto-compute derived columns from raw inputs."""
    d = entry
    # wet total crushed
    cd = d.get("crushed_d_tons") or 0
    cn = d.get("crushed_n_tons") or 0
    if cd or cn:
        d["wet_total_crushed_tons"] = cd + cn
    # total stacked
    sd = d.get("stacked_d_tons") or 0
    sn = d.get("stacked_n_tons") or 0
    if sd or sn:
        d["total_stacked_tons"] = sd + sn
    # total acid consumed
    sx  = d.get("acid_sx_usage_short_tons") or 0
    ca  = d.get("acid_cure_a_totalizer_st") or 0
    cb  = d.get("acid_cure_b_totalizer_st") or 0
    aux = d.get("acid_auxiliary_totalizer_st") or 0
    if sx or ca or cb or aux:
        d["total_acid_consumed_short_tons"] = sx + ca + cb + aux
    return d


def _sanitize(obj):
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


# ── monthly aggregation ───────────────────────────────────────────────────────

def _monthly_report() -> list[dict]:
    if not _rows:
        return []
    df = pd.DataFrame(_rows)
    df["report_date"] = pd.to_datetime(df["report_date"], errors="coerce")
    df = df.dropna(subset=["report_date"])
    df["_month"] = df["report_date"].dt.to_period("M")

    def avg_nonzero(s: pd.Series) -> float:
        pos = s[s > 0]
        return float(pos.mean()) if len(pos) else 0.0

    def fw_avg(grade: pd.Series, flow: pd.Series) -> float:
        g, f = grade.values.astype(float), flow.values.astype(float)
        denom = f.sum()
        return float((g * f).sum() / denom) if denom else 0.0

    result = []
    for month, g in df.groupby("_month"):
        def col(c):
            return g[c] if c in g.columns else pd.Series(dtype=float)

        row: dict = {
            "month": str(month),
            "total_crushed_tons":   float(col("wet_total_crushed_tons").sum()),
            "dry_crushed_tons":     float(col("dry_crushed_tons").sum()),
            "total_stacked_tons":   float(col("total_stacked_tons").sum()),
            "grade_tcu_pct":        fw_avg(col("grade_tcu_pct"), col("total_stacked_tons")),
            "grade_ascu_pct":       fw_avg(col("grade_ascu_pct"), col("total_stacked_tons")),
            "ton_tcu":              float((col("grade_tcu_pct") * col("total_stacked_tons")).sum()),
            "mining_primary_tons":  float(col("mining_tons_primary").sum()),
            "mining_secondary_tons": float(col("mining_tons_secondary").sum()),
            "mining_tertiary_tons": float(col("mining_tons_tertiary").sum()),
            "raffinate_a_avg_flow_gpm": avg_nonzero(col("raffinate_a_main_flow_gpm")),
            "raffinate_a_cu_grade_g_l": fw_avg(col("raffinate_a_cu_grade_g_l"), col("raffinate_a_main_flow_gpm")),
            "raffinate_b_avg_flow_gpm": avg_nonzero(col("raffinate_b_pad_flow_gpm")),
            "raffinate_b_cu_grade_g_l": fw_avg(col("raffinate_b_cu_grade_g_l"), col("raffinate_b_pad_flow_gpm")),
            "pls_b_avg_flow_gpm":   avg_nonzero(col("pls_b_flow_gpm")),
            "pls_b_cu_grade_g_l":   fw_avg(col("pls_b_cu_grade_g_l"), col("pls_b_flow_gpm")),
            "pls_a_avg_flow_gpm":   avg_nonzero(col("pls_a_flow_gpm")),
            "pls_a_cu_grade_g_l":   fw_avg(col("pls_a_cu_grade_g_l"), col("pls_a_flow_gpm")),
            "ew_block1_avg_amps":   avg_nonzero(col("ew_block1_dc_amps")),
            "ew_block2_avg_amps":   avg_nonzero(col("ew_block2_dc_amps")),
            "ew_block1_avg_efficiency": avg_nonzero(col("ew_block1_efficiency")),
            "ew_block2_avg_efficiency": avg_nonzero(col("ew_block2_efficiency")),
            "total_cu_harvested_lb": float(col("total_cu_harvested_lb").sum()),
            "acid_consumed_total_st": float(col("total_acid_consumed_short_tons").sum()),
            "acid_sx_usage_st":      float(col("acid_sx_usage_short_tons").sum()),
            "acid_delivered_st":     float(col("acid_delivered_short_tons").sum()),
        }
        result.append(row)
    return _sanitize(result)


# ── Pydantic model ────────────────────────────────────────────────────────────

class NutonLoadEntry(BaseModel):
    report_date: str
    crushed_d_tons: float | None = None
    crushed_n_tons: float | None = None
    wet_total_crushed_tons: float | None = None
    dry_crushed_tons: float | None = None
    stacked_d_tons: float | None = None
    stacked_n_tons: float | None = None
    total_stacked_tons: float | None = None
    grade_tcu_pct: float | None = None
    grade_ascu_pct: float | None = None
    grade_cucn_pct: float | None = None
    grade_cus_pct: float | None = None
    acid_cons_lb_per_t: float | None = None
    mining_tons_primary: float | None = None
    mining_tons_secondary: float | None = None
    mining_tons_tertiary: float | None = None
    raffinate_a_acid_cure_flow_gpm: float | None = None
    raffinate_a_main_flow_gpm: float | None = None
    raffinate_a_cu_grade_g_l: float | None = None
    raffinate_a_acid_grade_g_l: float | None = None
    raffinate_b_pad_flow_gpm: float | None = None
    raffinate_b_cu_grade_g_l: float | None = None
    raffinate_b_acid_grade_g_l: float | None = None
    pls_b_flow_gpm: float | None = None
    pls_b_cu_grade_g_l: float | None = None
    pls_b_acid_g_l: float | None = None
    pls_b_ph: float | None = None
    pls_a_flow_gpm: float | None = None
    pls_a_cu_grade_g_l: float | None = None
    pls_a_acid_g_l: float | None = None
    pls_a_ph: float | None = None
    ew_block1_dc_amps: float | None = None
    ew_block2_dc_amps: float | None = None
    ew_block1_efficiency: float | None = None
    ew_block2_efficiency: float | None = None
    total_cu_harvested_lb: float | None = None
    acid_delivered_short_tons: float | None = None
    acid_sx_usage_short_tons: float | None = None
    acid_cure_a_totalizer_st: float | None = None
    acid_cure_b_totalizer_st: float | None = None
    acid_auxiliary_totalizer_st: float | None = None
    acid_heap_leach_total_st: float | None = None
    total_acid_consumed_short_tons: float | None = None


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="Physicals Data Entry API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _current_user(request: Request) -> str:
    h = request.headers
    return (
        h.get("X-Forwarded-Preferred-Username")
        or h.get("X-Forwarded-Email")
        or "demo.user"
    )


@app.get("/api/nuton-load")
def api_list(limit: int = 100, offset: int = 0):
    return _get_all(limit=limit, offset=offset)


@app.get("/api/nuton-load/{report_date}")
def api_get(report_date: str):
    row = _get_by_date(report_date)
    if row is None:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return row


@app.post("/api/nuton-load")
def api_post(body: NutonLoadEntry, request: Request):
    entry = body.model_dump()
    entry = _derive(entry)
    entry["submitted_by"] = _current_user(request)
    entry["submitted_at"] = _dt.datetime.now().isoformat()
    saved = _upsert(entry)
    return {"status": "ok", "entry": _sanitize(saved)}


@app.delete("/api/nuton-load/{report_date}")
def api_delete(report_date: str):
    if _delete(report_date):
        return {"status": "ok", "deleted": report_date}
    return JSONResponse({"error": "Not found"}, status_code=404)


@app.get("/api/monthly-report")
def api_monthly():
    return _monthly_report()


# ── serve React frontend ──────────────────────────────────────────────────────

_dist = Path(__file__).parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
else:
    @app.get("/")
    def root():
        return {"message": "Frontend not built yet. Run: cd data-entry-app/frontend && npm run build"}
