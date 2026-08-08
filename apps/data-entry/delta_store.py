"""
Delta table store for nuton_load_daily.
Primary store when DATABRICKS_WAREHOUSE_ID is set; callers fall back to memory otherwise.

Auth strategy (in priority order):
  1. DATABRICKS_TOKEN env var (on Databricks Apps, platform injects this)
  2. `databricks auth token --host <host>` CLI command (for local dev)
"""
import json
import math
import logging
import os
import subprocess
import time
import requests
from typing import Optional

logger = logging.getLogger(__name__)

CATALOG = "serverless_stable_82bi8w_catalog"
SCHEMA  = "data_entry"
TABLE   = "nuton_load_daily"
FULL    = f"{CATALOG}.{SCHEMA}.{TABLE}"

_COLS = [
    "report_date",
    "crushed_d_tons", "crushed_n_tons", "wet_total_crushed_tons", "dry_crushed_tons",
    "stacked_d_tons", "stacked_n_tons", "total_stacked_tons",
    "grade_tcu_pct", "grade_ascu_pct", "grade_cucn_pct", "grade_cus_pct",
    "acid_cons_lb_per_t",
    "mining_tons_primary", "mining_tons_secondary", "mining_tons_tertiary",
    "raffinate_a_acid_cure_flow_gpm", "raffinate_a_main_flow_gpm",
    "raffinate_a_cu_grade_g_l", "raffinate_a_acid_grade_g_l",
    "raffinate_b_pad_flow_gpm", "raffinate_b_cu_grade_g_l", "raffinate_b_acid_grade_g_l",
    "pls_b_flow_gpm", "pls_b_cu_grade_g_l", "pls_b_acid_g_l", "pls_b_ph",
    "pls_a_flow_gpm", "pls_a_cu_grade_g_l", "pls_a_acid_g_l", "pls_a_ph",
    "ew_block1_dc_amps", "ew_block2_dc_amps",
    "ew_block1_efficiency", "ew_block2_efficiency",
    "total_cu_harvested_lb",
    "acid_delivered_short_tons", "acid_sx_usage_short_tons",
    "acid_cure_a_totalizer_st", "acid_cure_b_totalizer_st",
    "acid_auxiliary_totalizer_st", "acid_heap_leach_total_st",
    "total_acid_consumed_short_tons",
    "_id", "submitted_by", "submitted_at",
]

_CREATE_SCHEMA_SQL = f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}"

_CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {FULL} (
    report_date                     STRING NOT NULL,
    crushed_d_tons                  DOUBLE,
    crushed_n_tons                  DOUBLE,
    wet_total_crushed_tons          DOUBLE,
    dry_crushed_tons                DOUBLE,
    stacked_d_tons                  DOUBLE,
    stacked_n_tons                  DOUBLE,
    total_stacked_tons              DOUBLE,
    grade_tcu_pct                   DOUBLE,
    grade_ascu_pct                  DOUBLE,
    grade_cucn_pct                  DOUBLE,
    grade_cus_pct                   DOUBLE,
    acid_cons_lb_per_t              DOUBLE,
    mining_tons_primary             DOUBLE,
    mining_tons_secondary           DOUBLE,
    mining_tons_tertiary            DOUBLE,
    raffinate_a_acid_cure_flow_gpm  DOUBLE,
    raffinate_a_main_flow_gpm       DOUBLE,
    raffinate_a_cu_grade_g_l        DOUBLE,
    raffinate_a_acid_grade_g_l      DOUBLE,
    raffinate_b_pad_flow_gpm        DOUBLE,
    raffinate_b_cu_grade_g_l        DOUBLE,
    raffinate_b_acid_grade_g_l      DOUBLE,
    pls_b_flow_gpm                  DOUBLE,
    pls_b_cu_grade_g_l              DOUBLE,
    pls_b_acid_g_l                  DOUBLE,
    pls_b_ph                        DOUBLE,
    pls_a_flow_gpm                  DOUBLE,
    pls_a_cu_grade_g_l              DOUBLE,
    pls_a_acid_g_l                  DOUBLE,
    pls_a_ph                        DOUBLE,
    ew_block1_dc_amps               DOUBLE,
    ew_block2_dc_amps               DOUBLE,
    ew_block1_efficiency            DOUBLE,
    ew_block2_efficiency            DOUBLE,
    total_cu_harvested_lb           DOUBLE,
    acid_delivered_short_tons       DOUBLE,
    acid_sx_usage_short_tons        DOUBLE,
    acid_cure_a_totalizer_st        DOUBLE,
    acid_cure_b_totalizer_st        DOUBLE,
    acid_auxiliary_totalizer_st     DOUBLE,
    acid_heap_leach_total_st        DOUBLE,
    total_acid_consumed_short_tons  DOUBLE,
    _id                             BIGINT,
    submitted_by                    STRING,
    submitted_at                    STRING
)
USING DELTA
"""

# ── token cache ───────────────────────────────────────────────────────────────

_token_cache: dict = {}  # {"token": str, "expires_at": float}


def _get_token() -> Optional[str]:
    """Return a bearer token: env var first, then CLI."""
    env_token = os.environ.get("DATABRICKS_TOKEN", "")
    if env_token:
        return env_token

    now = time.time()
    if _token_cache.get("token") and _token_cache.get("expires_at", 0) > now + 60:
        return _token_cache["token"]

    host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
    profile = "fevm-stable"
    if not host:
        return None
    try:
        cli = subprocess.run(["which", "databricks"], capture_output=True, text=True).stdout.strip() or "databricks"
        result = subprocess.run(
            [cli, "auth", "token", "--profile", profile],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            logger.warning("databricks auth token failed: %s", result.stderr.strip())
            return None
        data = json.loads(result.stdout)
        token = data.get("access_token")
        expires_in = data.get("expires_in", 3600)
        _token_cache["token"] = token
        _token_cache["expires_at"] = now + expires_in
        return token
    except Exception as exc:
        logger.warning("CLI token fetch error: %s", exc)
        return None


def _headers() -> dict:
    token = _get_token()
    if not token:
        raise RuntimeError("No Databricks token available")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── core SQL execution ────────────────────────────────────────────────────────

def available() -> bool:
    return bool(os.environ.get("DATABRICKS_WAREHOUSE_ID"))


def _exec(sql: str) -> Optional[list[dict]]:
    """Run SQL via REST statement execution API. Returns row dicts or None on failure."""
    warehouse_id = os.environ.get("DATABRICKS_WAREHOUSE_ID", "")
    host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
    if not warehouse_id or not host:
        return None
    try:
        resp = requests.post(
            f"{host}/api/2.0/sql/statements",
            headers=_headers(),
            json={"statement": sql, "warehouse_id": warehouse_id, "wait_timeout": "50s"},
            timeout=60,
        )
        if resp.status_code != 200:
            logger.warning("Delta SQL HTTP %s: %s | SQL: %.80s", resp.status_code, resp.text[:120], sql)
            return None
        body = resp.json()
        state = body.get("status", {}).get("state")
        if state != "SUCCEEDED":
            logger.warning("Delta SQL state=%s: %.120s", state, sql)
            return None
        result = body.get("result", {})
        data_array = result.get("data_array") or []
        if not data_array:
            return []
        cols = [c["name"] for c in body["manifest"]["schema"]["columns"]]
        return [_coerce(dict(zip(cols, row))) for row in data_array]
    except Exception as exc:
        logger.warning("Delta exec error: %s", exc)
        return None


def _coerce(row: dict) -> dict:
    """REST API returns all values as strings — cast to proper Python types."""
    _str_cols = {"report_date", "submitted_by", "submitted_at"}
    out: dict = {}
    for k, v in row.items():
        if v is None or v == "":
            out[k] = None
        elif k == "_id":
            try:
                out[k] = int(v)
            except (ValueError, TypeError):
                out[k] = v
        elif k in _str_cols:
            out[k] = v
        else:
            try:
                f = float(v)
                out[k] = None if (math.isnan(f) or math.isinf(f)) else f
            except (ValueError, TypeError):
                out[k] = v
    return out


def _lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, float):
        return "NULL" if (math.isnan(v) or math.isinf(v)) else repr(v)
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


# ── public API ────────────────────────────────────────────────────────────────

def ensure_table() -> bool:
    ok1 = _exec(_CREATE_SCHEMA_SQL) is not None
    ok2 = _exec(_CREATE_TABLE_SQL) is not None
    if ok1 and ok2:
        logger.info("Delta table ready: %s", FULL)
    return ok1 and ok2


def read_all() -> Optional[list[dict]]:
    return _exec(f"SELECT * FROM {FULL} ORDER BY report_date DESC")


def upsert(entry: dict) -> bool:
    select_exprs = ", ".join(f"{_lit(entry.get(c))} AS {c}" for c in _COLS)
    update_set   = ", ".join(f"t.{c} = s.{c}" for c in _COLS if c != "report_date")
    col_list     = ", ".join(_COLS)
    val_list     = ", ".join(f"s.{c}" for c in _COLS)
    sql = f"""
MERGE INTO {FULL} AS t
USING (SELECT {select_exprs}) AS s
ON t.report_date = s.report_date
WHEN MATCHED THEN UPDATE SET {update_set}
WHEN NOT MATCHED THEN INSERT ({col_list}) VALUES ({val_list})
"""
    ok = _exec(sql) is not None
    if not ok:
        logger.warning("Delta upsert failed for %s", entry.get("report_date"))
    return ok


def delete(report_date: str) -> bool:
    ok = _exec(f"DELETE FROM {FULL} WHERE report_date = {_lit(report_date)}") is not None
    if not ok:
        logger.warning("Delta delete failed for %s", report_date)
    return ok
