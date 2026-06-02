import math
import logging
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from constants import BIGF_AREAS
from helpers import buildValLookup, fmtVal, statusColor, _lim
from db import (
    getAllTagProfiles, getTagProfiles, getAllLatestValues,
    getGoldLatestRow, getTrendData, getBigFAll, clear_cache,
    getBioReactorDailyTrend, SCALE_UP_LIMITS,
    get_stacking_data, get_ore_feed_rate,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Nuton Demo API")

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
        return []

    latest = getAllLatestValues()
    hist_tags = set(profiles[
        profiles["DataSource"].str.contains("Historian", na=False, case=False)
    ]["Tag"].tolist())
    latest_filt = latest[latest["Tag"].isin(hist_tags)] if not latest.empty else pd.DataFrame()
    val_lookup  = buildValLookup(latest_filt)

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
    for bf in BIGF_AREAS:
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


# ── Cache management ──────────────────────────────────────────────────────────

@app.post("/api/cache/clear")
def api_cache_clear():
    clear_cache()
    return {"status": "cleared"}


# ── Serve React frontend (must be last) ───────────────────────────────────────

_dist = Path(__file__).parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")
else:
    logger.warning("frontend/dist not found — run `npm run build` inside frontend/")

    @app.get("/")
    def root():
        return {"message": "Frontend not built. Run: cd frontend && npm run build"}
