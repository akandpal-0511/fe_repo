import math
import logging
import datetime as _dt
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from constants import PA_SUB_AREAS
from helpers import buildValLookup, fmtVal, statusColor, _lim
from db import (
    getAllTagProfiles, getTagProfiles, getAllLatestValues,
    getGoldLatestRow, getTrendData, getBigFAll, clear_cache,
    getBioReactorDailyTrend, SCALE_UP_LIMITS,
    get_stacking_data, get_ore_feed_rate,
)
from causality import pa_heatmap, sensor_network, granger_test, early_warning
import nuton_load_store as nl_store
from forecast import forecast_tag

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Operations Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sanitize(obj):
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def _df_to_records(df: pd.DataFrame) -> list:
    if df.empty:
        return []
    return _sanitize(df.where(pd.notna(df), None).to_dict(orient="records"))


# ── Tag profiles ──────────────────────────────────────────────────────────────

@app.get("/api/tag-profiles")
def api_all_profiles():
    return _df_to_records(getAllTagProfiles())


@app.get("/api/tag-profiles/{area}")
def api_area_profiles(area: str):
    return _df_to_records(getTagProfiles(area))


# ── Latest values ─────────────────────────────────────────────────────────────

@app.get("/api/latest-values")
def api_latest_values():
    return _df_to_records(getAllLatestValues())


# ── Gold table ────────────────────────────────────────────────────────────────

@app.get("/api/gold/{table}")
def api_gold(table: str):
    df = getGoldLatestRow(table)
    if df.empty:
        return {}
    return _sanitize(df.iloc[0].where(pd.notna(df.iloc[0]), None).to_dict())


# ── Trend data ────────────────────────────────────────────────────────────────

@app.get("/api/trends")
def api_trends(
    tags: str = Query(..., description="Comma-separated tag names"),
    start: str = Query(..., description="ISO date YYYY-MM-DD"),
    end: str   = Query(..., description="ISO date YYYY-MM-DD"),
):
    tag_tuple = tuple(t.strip() for t in tags.split(",") if t.strip())
    if not tag_tuple:
        return []
    return _df_to_records(getTrendData(tag_tuple, start, end))


# ── KPI strip data ────────────────────────────────────────────────────────────

@app.get("/api/kpis/{area}")
def api_kpis(area: str):
    profiles = getTagProfiles(area)
    if profiles.empty:
        return []

    kpis = profiles[profiles["IsCalculated"] == True]
    if kpis.empty:
        # Fall back to first 6 non-calculated sensors as KPI tiles
        kpis = profiles[profiles["IsCalculated"] == False].head(6)
    if kpis.empty:
        return []

    latest = getAllLatestValues()
    hist_tags = set(profiles[
        profiles["DataSource"].str.contains("Historian", na=False, case=False)
    ]["Tag"].tolist())
    latest_filt = latest[latest["Tag"].isin(hist_tags)] if not latest.empty else pd.DataFrame()
    val_lookup  = buildValLookup(latest_filt) if not latest_filt.empty else {}

    result = []
    for _, kr in kpis.head(8).iterrows():
        tag = kr["Tag"]
        val = val_lookup.get(tag)
        lo  = _lim(kr.get("LowerLimit"))
        hi  = _lim(kr.get("UpperLimit"))
        result.append({
            "tag":         tag,
            "description": kr["Description"],
            "value":       val if val is not None and not (isinstance(val, float) and math.isnan(val)) else None,
            "formatted":   fmtVal(val, kr.get("Unit", "") or ""),
            "statusColor": statusColor(val, lo, hi),
            "lo":          lo,
            "hi":          hi,
            "unit":        kr.get("Unit", "") or "",
        })
    return result


# ── BIGF per-reactor profiles ─────────────────────────────────────────────────

@app.get("/api/bigf-profiles")
def api_bigf_profiles():
    all_prof = getAllTagProfiles()
    result = {}
    for bf in PA_SUB_AREAS:
        sub = all_prof[all_prof["PerformanceArea"] == bf] if not all_prof.empty else pd.DataFrame()
        sensor = sub[
            sub["DataSource"].str.contains("Historian", na=False, case=False) &
            (sub["IsCalculated"] == False)
        ][["Description", "Tag"]].drop_duplicates() if not sub.empty else pd.DataFrame()
        result[bf] = _df_to_records(sensor)
    return result


# ── Scale Up Bio Reactor daily trends ─────────────────────────────────────────

@app.get("/api/bio-reactor-daily")
def api_bio_reactor_daily(
    measures: str = Query(..., description="Comma-separated profile tag names"),
    start:    str = Query(..., description="ISO date YYYY-MM-DD"),
    end:      str = Query(..., description="ISO date YYYY-MM-DD"),
):
    tags   = tuple(t.strip() for t in measures.split(",") if t.strip())
    df     = getBioReactorDailyTrend(tags, start, end)
    points = _df_to_records(df) if not df.empty else []

    limits: dict = {}
    for tag in tags:
        if tag in SCALE_UP_LIMITS:
            limits[tag] = {
                temp: list(bounds)
                for temp, bounds in SCALE_UP_LIMITS[tag].items()
            }

    return {"points": points, "limits": limits}


# ── Stacking ──────────────────────────────────────────────────────────────────

@app.get("/api/stacking/cell-allocation")
def api_stacking(mode: str = "prod"):
    return get_stacking_data(mode)


@app.get("/api/stacking/ore-feed-rate")
def api_ore_feed_rate(days: int = 7):
    return get_ore_feed_rate(days)


# ── Nuton Load daily entry ────────────────────────────────────────────────────

class NutonLoadEntry(BaseModel):
    report_date: str
    # Stacking / Crushing
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
    # Mining
    mining_tons_primary: float | None = None
    mining_tons_secondary: float | None = None
    mining_tons_tertiary: float | None = None
    # Raffinate Zone-A
    raffinate_a_acid_cure_flow_gpm: float | None = None
    raffinate_a_main_flow_gpm: float | None = None
    raffinate_a_cu_grade_g_l: float | None = None
    raffinate_a_acid_grade_g_l: float | None = None
    # Raffinate Zone-B
    raffinate_b_pad_flow_gpm: float | None = None
    raffinate_b_cu_grade_g_l: float | None = None
    raffinate_b_acid_grade_g_l: float | None = None
    # PLS Zone-B
    pls_b_flow_gpm: float | None = None
    pls_b_cu_grade_g_l: float | None = None
    pls_b_acid_g_l: float | None = None
    pls_b_ph: float | None = None
    # PLS Zone-A
    pls_a_flow_gpm: float | None = None
    pls_a_cu_grade_g_l: float | None = None
    pls_a_acid_g_l: float | None = None
    pls_a_ph: float | None = None
    # EW
    ew_block1_dc_amps: float | None = None
    ew_block2_dc_amps: float | None = None
    ew_block1_efficiency: float | None = None
    ew_block2_efficiency: float | None = None
    total_cu_harvested_lb: float | None = None
    # Acid
    acid_delivered_short_tons: float | None = None
    acid_sx_usage_short_tons: float | None = None
    acid_cure_a_totalizer_st: float | None = None
    acid_cure_b_totalizer_st: float | None = None
    acid_auxiliary_totalizer_st: float | None = None
    acid_heap_leach_total_st: float | None = None
    total_acid_consumed_short_tons: float | None = None


@app.get("/api/nuton-load")
def api_nuton_load_list(limit: int = 100, offset: int = 0):
    return nl_store.get_all(limit=limit, offset=offset)


@app.get("/api/nuton-load/{report_date}")
def api_nuton_load_get(report_date: str):
    row = nl_store.get_by_date(report_date)
    if row is None:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "Not found"}, status_code=404)
    return row


@app.post("/api/nuton-load")
def api_nuton_load_post(body: NutonLoadEntry, request: Request):
    entry = body.model_dump()
    entry["submitted_by"] = _current_user(request)
    saved = nl_store.upsert(entry)
    return {"status": "ok", "entry": _sanitize(saved)}


# ── Cache management ──────────────────────────────────────────────────────────

@app.post("/api/cache/clear")
def api_cache_clear():
    clear_cache()
    return {"status": "cleared"}


# ── Causality ─────────────────────────────────────────────────────────────────

class CausalityHeatmapIn(BaseModel):
    areas: list[str]
    start: str
    end: str
    max_lag_hours: int = 48


class CausalityNetworkIn(BaseModel):
    areas: list[str]
    start: str
    end: str
    max_lag_hours: int = 48
    threshold: float = 0.4


class CausalityGrangerIn(BaseModel):
    edges: list[dict]
    start: str
    end: str
    max_lag_hours: int = 48


class EarlyWarningIn(BaseModel):
    target_tag: str
    areas: list[str]
    start: str
    end: str
    max_lag_hours: int = 48
    threshold: float = 0.5
    top_n: int = 10


@app.post("/api/causality/heatmap")
def api_causality_heatmap(body: CausalityHeatmapIn):
    return pa_heatmap(body.areas, body.start, body.end, body.max_lag_hours)


@app.post("/api/causality/network")
def api_causality_network(body: CausalityNetworkIn):
    return sensor_network(body.areas, body.start, body.end, body.max_lag_hours, body.threshold)


@app.post("/api/causality/granger")
def api_causality_granger(body: CausalityGrangerIn):
    return granger_test(body.edges, body.start, body.end, body.max_lag_hours)


@app.post("/api/causality/early-warning")
def api_causality_early_warning(body: EarlyWarningIn):
    return early_warning(
        body.target_tag, body.areas, body.start, body.end,
        body.max_lag_hours, body.threshold, body.top_n,
    )


# ── Forecast ──────────────────────────────────────────────────────────────────

class ForecastIn(BaseModel):
    tag: str
    start: str
    end: str
    horizon_hours: int = 12
    lo: float | None = None
    hi: float | None = None


@app.post("/api/forecast")
def api_forecast(body: ForecastIn):
    return forecast_tag(body.tag, body.start, body.end, body.horizon_hours, body.lo, body.hi)


# ── Comments (in-memory for demo) ─────────────────────────────────────────────

_comments: list[dict] = []
_comment_id_seq: int = 0


class CommentIn(BaseModel):
    category: str
    text: str
    area: str | None = None
    tag_name: str | None = None
    week_range: str | None = None


def _current_user(request: Request) -> str:
    h = request.headers
    return (
        h.get("X-Forwarded-Preferred-Username")
        or h.get("X-Forwarded-Email")
        or "demo.user"
    )


@app.get("/api/comments")
def api_get_comments(area: str = "General"):
    return [c for c in _comments if c["performance_area"] == area]


@app.post("/api/comments")
def api_add_comment(body: CommentIn, request: Request):
    global _comment_id_seq
    text = body.text.strip()
    if not text:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "Comment text is required."}, status_code=400)
    _comment_id_seq += 1
    _comments.append({
        "id":                _comment_id_seq,
        "performance_area":  body.area or "General",
        "tag_name":          body.tag_name or "N/A",
        "week_range":        body.week_range or "N/A",
        "comment_category":  body.category,
        "comment_text":      text,
        "created_at":        _dt.datetime.now().isoformat(),
        "created_by":        _current_user(request),
    })
    return {"status": "ok"}


@app.delete("/api/comments/{comment_id}")
def api_delete_comment(comment_id: int, area: str = "General"):
    global _comments
    _comments = [c for c in _comments if not (c["id"] == comment_id and c["performance_area"] == area)]
    return {"status": "ok"}


# ── Serve React frontend (must be last) ───────────────────────────────────────

_dist = Path(__file__).parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
else:
    logger.warning("frontend/dist not found — run `npm run build` inside frontend/")

    @app.get("/")
    def root():
        return {"message": "Frontend not built. Run: cd frontend && npm run build"}
