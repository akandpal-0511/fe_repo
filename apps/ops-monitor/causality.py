"""
Cross-correlation causality engine.

Two modes:
  1. pa_heatmap(areas, start, end, max_lag_hours)
     → 2-D grid: for each PA-pair, the max absolute correlation across all
       sensor pairs and all lags, plus the dominant lag.

  2. sensor_network(areas, start, end, max_lag_hours, threshold)
     → nodes + edges for the network graph for a subset of PAs.
"""

import logging
import math
from itertools import combinations
from statsmodels.tsa.stattools import grangercausalitytests

import numpy as np
import pandas as pd

from db import getTrendData, getAllTagProfiles

logger = logging.getLogger(__name__)

# Process order — used to sort PA axis on the heatmap
PROCESS_ORDER = [
    "PA-1", "PA-2", "PA-3", "PA-4", "PA-5",
    "PA-6", "PA-7", "PA-8", "PA-9", "PA-10",
    "PA-11", "PA-12", "PA-13",
]

# Linear position of each process area in the flowsheet. Used only to filter
# out physically implausible causal directions (a downstream area "causing" an
# upstream one). A simple 1..N chain along PROCESS_ORDER.
PROCESS_RANK: dict[str, int] = {pa: i + 1 for i, pa in enumerate(PROCESS_ORDER)}

# Known recycle/feedback loops where a downstream area legitimately feeds back
# upstream (so that direction is NOT filtered out). None modelled in this
# generic demo; add pairs here to allow specific reverse links.
FEEDBACK_PAIRS: set[tuple[str, str]] = set()

PA_COLOURS = {
    "PA-1":  "#f0883e",
    "PA-2":  "#d29922",
    "PA-3":  "#3fb950",
    "PA-4":  "#58a6ff",
    "PA-5":  "#a371f7",
    "PA-6":  "#79c0ff",
    "PA-7":  "#56d364",
    "PA-8":  "#ff7b72",
    "PA-9":  "#ffa657",
    "PA-10": "#d2a8ff",
    "PA-11": "#7ee787",
    "PA-12": "#ffa657",
    "PA-13": "#e3b341",
}
DEFAULT_COLOUR = "#7d8590"

# Max sensors per PA to pull — keeps the computation tractable
MAX_SENSORS_PER_PA = 20

# Resample interval for trend data
RESAMPLE_FREQ = "1h"


def _sort_areas(areas: list[str]) -> list[str]:
    order = {pa: i for i, pa in enumerate(PROCESS_ORDER)}
    return sorted(areas, key=lambda a: order.get(a, 999))


def _get_historian_tags(areas: list[str], all_sources: bool = False) -> dict[str, list[dict]]:
    """Return {pa → [{tag, description}, ...]} for sensors in the given areas.

    all_sources=True includes non-Historian sources — used
    for single-PA intra-sensor analysis where all available signals are relevant.
    """
    all_prof = getAllTagProfiles()
    if all_prof.empty:
        return {}
    mask = all_prof["PerformanceArea"].isin(areas)
    if not all_sources:
        mask &= all_prof["DataSource"].str.contains("Historian", na=False, case=False)
        mask &= (all_prof["IsCalculated"] == False)
    hist = all_prof[mask].copy()
    result: dict[str, list[dict]] = {}
    for pa, grp in hist.groupby("PerformanceArea"):
        rows = grp[["Tag", "Description"]].drop_duplicates("Tag").head(MAX_SENSORS_PER_PA)
        result[pa] = rows.to_dict(orient="records")
    return result


def _fetch_pivoted(all_tags: list[str], start: str, end: str) -> pd.DataFrame:
    """Fetch trend data and pivot to wide format, hourly resampled."""
    if not all_tags:
        return pd.DataFrame()
    df = getTrendData(tuple(all_tags), start, end)
    if df is None or df.empty:
        return pd.DataFrame()
    df["Timestamp_AZ"] = pd.to_datetime(df["Timestamp_AZ"], utc=True)
    df["Value"] = pd.to_numeric(df["Value"], errors="coerce")
    pivot = (
        df.groupby(["Timestamp_AZ", "Tag"])["Value"]
        .mean()
        .unstack("Tag")
        .resample(RESAMPLE_FREQ)
        .mean()
    )
    return pivot


def _xcorr(a: np.ndarray, b: np.ndarray, max_lag: int) -> tuple[float, int]:
    """
    Return (peak_correlation, lag_hours) for lags in [-max_lag, +max_lag].
    Positive lag means A leads B (A causes B).
    Uses np.corrcoef per slice so r is always in [-1, 1].
    """
    best_r, best_lag = 0.0, 0
    n = len(a)
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            aa, bb = a[lag:], b[:n - lag] if lag > 0 else b
        else:
            aa, bb = a[:n + lag], b[-lag:]
        mask = ~(np.isnan(aa) | np.isnan(bb))
        if mask.sum() < 10:
            continue
        aa_c, bb_c = aa[mask], bb[mask]
        if np.std(aa_c) < 1e-10 or np.std(bb_c) < 1e-10:
            continue
        r = float(np.corrcoef(aa_c, bb_c)[0, 1])
        r = max(-1.0, min(1.0, r))  # guard against floating point edge cases
        if abs(r) > abs(best_r):
            best_r, best_lag = r, lag
    return best_r, best_lag


# ── Public API ─────────────────────────────────────────────────────────────────

def pa_heatmap(
    areas: list[str],
    start: str,
    end: str,
    max_lag_hours: int = 48,
) -> dict:
    """
    Returns {
      areas: [...sorted...],
      matrix: [[{corr, lag}, ...], ...],   # len(areas) × len(areas)
    }
    Same-PA diagonal cells are null.
    """
    sorted_areas = _sort_areas(areas)
    tags_by_pa = _get_historian_tags(sorted_areas)

    all_tags = [t["Tag"] for pa_tags in tags_by_pa.values() for t in pa_tags]
    pivot = _fetch_pivoted(all_tags, start, end)

    n = len(sorted_areas)
    matrix: list[list[dict | None]] = [[None] * n for _ in range(n)]

    for i, pa_i in enumerate(sorted_areas):
        tags_i = [t["Tag"] for t in tags_by_pa.get(pa_i, []) if t["Tag"] in (pivot.columns if not pivot.empty else [])]
        for j, pa_j in enumerate(sorted_areas):
            if i == j:
                continue
            # Skip physically impossible direction (pa_i downstream of pa_j)
            # unless it is a known feedback pair
            rank_i = PROCESS_RANK.get(pa_i, 99)
            rank_j = PROCESS_RANK.get(pa_j, 99)
            if rank_i > rank_j and (pa_i, pa_j) not in FEEDBACK_PAIRS:
                continue
            tags_j = [t["Tag"] for t in tags_by_pa.get(pa_j, []) if t["Tag"] in (pivot.columns if not pivot.empty else [])]
            if not tags_i or not tags_j or pivot.empty:
                matrix[i][j] = {"corr": 0.0, "lag": 0}
                continue
            best_r, best_lag = 0.0, 0
            for ti in tags_i[:8]:  # cap to keep latency low
                for tj in tags_j[:8]:
                    a = pivot[ti].values if ti in pivot.columns else np.array([])
                    b = pivot[tj].values if tj in pivot.columns else np.array([])
                    if len(a) == 0 or len(b) == 0:
                        continue
                    r, lag = _xcorr(a, b, max_lag_hours)
                    if abs(r) > abs(best_r):
                        best_r, best_lag = r, lag
            matrix[i][j] = {"corr": round(best_r, 3), "lag": best_lag}

    return {"areas": sorted_areas, "matrix": matrix}


def sensor_network(
    areas: list[str],
    start: str,
    end: str,
    max_lag_hours: int = 48,
    threshold: float = 0.4,
) -> dict:
    """
    Returns {
      nodes: [{id, tag, description, pa, colour, degree}, ...],
      edges: [{source, target, corr, lag, direction}, ...],
    }
    direction: "forward" (source leads target) or "inverse"
    """
    sorted_areas = _sort_areas(areas)
    single_pa_mode = len(sorted_areas) == 1
    tags_by_pa = _get_historian_tags(sorted_areas, all_sources=single_pa_mode)

    all_tags = [t["Tag"] for pa_tags in tags_by_pa.values() for t in pa_tags]
    if not all_tags:
        return {"nodes": [], "edges": []}

    pivot = _fetch_pivoted(all_tags, start, end)

    tag_info: dict[str, dict] = {}
    for pa, tag_list in tags_by_pa.items():
        for t in tag_list:
            tag_info[t["Tag"]] = {"pa": pa, "description": t["Description"]}

    edges = []
    present_tags = [t for t in all_tags if not pivot.empty and t in pivot.columns]

    # For single-PA analysis, allow within-PA pairs; otherwise cross-PA only
    single_pa_mode = len(sorted_areas) == 1
    for ti, tj in combinations(present_tags, 2):
        pa_i = tag_info[ti]["pa"]
        pa_j = tag_info[tj]["pa"]
        if not single_pa_mode and pa_i == pa_j:
            continue
        a = pivot[ti].values
        b = pivot[tj].values
        r, lag = _xcorr(a, b, max_lag_hours)
        if abs(r) < threshold:
            continue
        # Positive lag → ti leads tj (ti causes tj)
        if lag >= 0:
            source, target, direction = ti, tj, "forward"
            src_pa, tgt_pa = pa_i, pa_j
        else:
            source, target, direction = tj, ti, "forward"
            src_pa, tgt_pa = pa_j, pa_i
            lag = -lag

        # Cross-PA mode: filter out physically impossible directions
        # (source downstream of target) unless it's a known feedback pair
        if not single_pa_mode:
            src_rank = PROCESS_RANK.get(src_pa, 99)
            tgt_rank = PROCESS_RANK.get(tgt_pa, 99)
            if src_rank > tgt_rank and (src_pa, tgt_pa) not in FEEDBACK_PAIRS:
                continue

        edges.append({
            "source":    source,
            "target":    target,
            "corr":      round(r, 3),
            "lag":       lag,
            "direction": direction,
        })

    # Build nodes only for tags that appear in edges
    active_tags = set()
    for e in edges:
        active_tags.add(e["source"])
        active_tags.add(e["target"])

    # degree
    degree: dict[str, int] = {}
    for e in edges:
        degree[e["source"]] = degree.get(e["source"], 0) + 1
        degree[e["target"]] = degree.get(e["target"], 0) + 1

    nodes = []
    for tag in active_tags:
        info = tag_info.get(tag, {})
        pa   = info.get("pa", "Unknown")
        nodes.append({
            "id":          tag,
            "tag":         tag,
            "description": info.get("description", tag),
            "pa":          pa,
            "colour":      PA_COLOURS.get(pa, DEFAULT_COLOUR),
            "degree":      degree.get(tag, 0),
        })

    return {"nodes": nodes, "edges": edges}


def early_warning(
    target_tag: str,
    all_areas: list[str],
    start: str,
    end: str,
    max_lag_hours: int = 48,
    threshold: float = 0.5,
    top_n: int = 10,
) -> list[dict]:
    """
    For a given target KPI tag, find upstream sensors that *lead* it —
    i.e. cross-correlate every other sensor against the target, keep those
    with |r| >= threshold and positive lag (sensor fires BEFORE the target moves).

    Returns a ranked list of early-warning sensors:
    [{tag, description, pa, colour, lag_hours, corr, direction}]
    sorted by |corr| descending.
    """
    tags_by_pa = _get_historian_tags(all_areas)
    all_tags = [t["Tag"] for pa_tags in tags_by_pa.values() for t in pa_tags]
    if target_tag not in all_tags:
        all_tags.append(target_tag)

    pivot = _fetch_pivoted(all_tags, start, end)
    if pivot.empty or target_tag not in pivot.columns:
        return []

    target_series = pivot[target_tag].values

    tag_info: dict[str, dict] = {}
    for pa, tag_list in tags_by_pa.items():
        for t in tag_list:
            tag_info[t["Tag"]] = {"pa": pa, "description": t["Description"]}

    results = []
    for tag in all_tags:
        if tag == target_tag or tag not in pivot.columns:
            continue
        sensor_series = pivot[tag].values
        r, lag = _xcorr(sensor_series, target_series, max_lag_hours)
        if abs(r) < threshold:
            continue
        # Positive lag means sensor leads target
        if lag <= 0:
            continue
        info = tag_info.get(tag, {})
        pa = info.get("pa", "Unknown")
        results.append({
            "tag":         tag,
            "description": info.get("description", tag),
            "pa":          pa,
            "colour":      PA_COLOURS.get(pa, DEFAULT_COLOUR),
            "lag_hours":   lag,
            "corr":        round(r, 3),
            "direction":   "positive" if r > 0 else "inverse",
        })

    results.sort(key=lambda x: abs(x["corr"]), reverse=True)
    return results[:top_n]


def granger_test(
    edges: list[dict],
    start: str,
    end: str,
    max_lag_hours: int = 48,
) -> list[dict]:
    """
    Run Granger causality tests on a pre-filtered list of edges.

    For each edge {source, target, lag, ...}, tests whether source
    Granger-causes target. Uses the edge's own lag as the test lag.

    Returns the same edges enriched with:
      granger_p    — minimum p-value across F-test and chi2-test at this lag
      granger_confirmed — True if p < 0.05
    """
    if not edges:
        return []

    # Collect all unique tags needed
    all_tags = list({e["source"] for e in edges} | {e["target"] for e in edges})
    pivot = _fetch_pivoted(all_tags, start, end)

    results = []
    for edge in edges:
        src, tgt = edge["source"], edge["target"]
        lag = max(1, edge["lag"])  # Granger needs lag ≥ 1

        enriched = {**edge, "granger_p": None, "granger_confirmed": False}

        if pivot.empty or src not in pivot.columns or tgt not in pivot.columns:
            results.append(enriched)
            continue

        # Build a 2-column DataFrame [target, source] — statsmodels convention
        df = pivot[[tgt, src]].dropna()

        # Need enough observations: at least 4× the lag
        if len(df) < max(30, lag * 4):
            results.append(enriched)
            continue

        try:
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                test_result = grangercausalitytests(df, maxlag=lag, verbose=False)

            # Extract the minimum p-value at our lag across both F and chi2 tests
            lag_result = test_result[lag]
            p_ssr_ftest  = lag_result[0]["ssr_ftest"][1]
            p_ssr_chi2   = lag_result[0]["ssr_chi2test"][1]
            p_min        = float(min(p_ssr_ftest, p_ssr_chi2))
            p_min        = round(p_min, 4)

            enriched["granger_p"]         = p_min
            enriched["granger_confirmed"] = p_min < 0.05
        except Exception as e:
            logger.warning(f"Granger test failed for {src}→{tgt}: {e}")

        results.append(enriched)

    return results
