"""
One-time seed: reads Nuton Load data rows from the Excel and bulk-inserts into
serverless_stable_82bi8w_catalog.data_entry.nuton_load_daily_real

Run from repo root:
  python scripts/seed_from_excel.py <path-to-excel>
"""
import json
import math
import re
import subprocess
import sys
import time
from pathlib import Path

import requests
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

EXCEL        = sys.argv[1] if len(sys.argv) > 1 else "docs/Physicals_Master.xlsx"
HOST         = "https://fevm-serverless-stable-82bi8w.cloud.databricks.com"
WAREHOUSE_ID = "7bbb09542781a5c7"
FULL         = "serverless_stable_82bi8w_catalog.data_entry.nuton_load_daily_real"
PROFILE      = "fevm-stable"
CONFIG_PATH  = Path(__file__).parent.parent / "apps/data-entry-real/config/form_config.json"

# ── auth ──────────────────────────────────────────────────────────────────────

def get_token() -> str:
    r = subprocess.run(
        ["databricks", "auth", "token", "--profile", PROFILE],
        capture_output=True, text=True, timeout=10,
    )
    return json.loads(r.stdout)["access_token"]


def sql_exec(q: str, token: str) -> list | None:
    resp = requests.post(
        f"{HOST}/api/2.0/sql/statements",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"statement": q, "warehouse_id": WAREHOUSE_ID, "wait_timeout": "50s"},
        timeout=120,
    )
    b = resp.json()
    state = b.get("status", {}).get("state")
    if state != "SUCCEEDED":
        msg = b.get("status", {}).get("error", {}).get("message", "")[:300]
        print(f"  SQL FAILED [{state}]: {msg}")
        return None
    return (b.get("result") or {}).get("data_array") or []


# ── load column map from form_config ─────────────────────────────────────────

cfg = json.loads(CONFIG_PATH.read_text())
# col_letter -> snake name (from form_config fields that have "col" key)
letter_to_snake: dict[str, str] = {}
for tab in cfg["tabs"]:
    for f in tab["fields"]:
        if f.get("col"):
            letter_to_snake[f["col"]] = f["snake"]

# stacking_date is col B
letter_to_snake["B"] = "stacking_date"

print(f"Column map: {len(letter_to_snake)} columns")

# ── read Excel data rows ──────────────────────────────────────────────────────

print(f"Loading {EXCEL}...")
wb = load_workbook(EXCEL, data_only=True)
ws = wb["Nuton Load"]

_NA_STRINGS = {"#N/A", "#REF!", "#VALUE!", "#DIV/0!", "#NAME?", "#NULL!", "#NUM!", "#ERROR!"}

def lit(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, float):
        return "NULL" if (math.isnan(v) or math.isinf(v)) else repr(v)
    if isinstance(v, int):
        return str(v)
    if hasattr(v, "strftime"):
        return "'" + v.strftime("%Y-%m-%d") + "'"
    s = str(v)
    if s in _NA_STRINGS:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


# Collect data rows (row 5 onwards, col A has the date via formula — use col B stacking date)
rows_to_insert = []
for r in range(5, ws.max_row + 1):
    date_val = ws.cell(r, 2).value  # col B = stacking date
    if date_val is None:
        continue
    # skip aggregate/summary rows
    if isinstance(date_val, str) and not re.match(r"\d{4}", str(date_val)):
        continue
    if hasattr(date_val, "strftime"):
        date_str = date_val.strftime("%Y-%m-%d")
    else:
        date_str = str(date_val)[:10]

    row_data = {"stacking_date": date_str}
    for letter, snake in letter_to_snake.items():
        if snake == "stacking_date":
            continue
        col_idx = None
        try:
            from openpyxl.utils import column_index_from_string
            col_idx = column_index_from_string(letter)
        except Exception:
            continue
        v = ws.cell(r, col_idx).value
        # skip formula strings
        if isinstance(v, str) and v.startswith("="):
            v = None
        row_data[snake] = v

    rows_to_insert.append(row_data)

print(f"Found {len(rows_to_insert)} data rows in Excel")

if not rows_to_insert:
    print("Nothing to insert.")
    sys.exit(0)

# ── bulk insert via MERGE ─────────────────────────────────────────────────────

token = get_token()
all_cols = list(rows_to_insert[0].keys())

inserted = 0
skipped  = 0
BATCH    = 50  # rows per statement

col_list = ", ".join(f"`{c}`" for c in all_cols)

for i, row in enumerate(rows_to_insert):
    # Build single-row MERGE using SELECT literals (avoids VALUES alias restriction)
    select_exprs = ", ".join(f"CAST({lit(row.get(c))} AS STRING) AS `{c}`" if c == "stacking_date"
                             else f"CAST({lit(row.get(c))} AS DOUBLE) AS `{c}`"
                             for c in all_cols)
    update_set   = ", ".join(f"t.`{c}` = s.`{c}`" for c in all_cols if c != "stacking_date")
    val_list     = ", ".join(f"s.`{c}`" for c in all_cols)

    sql = f"""
MERGE INTO {FULL} AS t
USING (SELECT {select_exprs}) AS s
ON t.stacking_date = s.stacking_date
WHEN MATCHED THEN UPDATE SET {update_set}
WHEN NOT MATCHED THEN INSERT ({col_list}) VALUES ({val_list})
"""
    result = sql_exec(sql, token)
    if result is not None:
        inserted += 1
        if (i + 1) % 50 == 0:
            print(f"  Progress: {i+1}/{len(rows_to_insert)} rows")
    else:
        skipped += 1
        print(f"  Skipped row {i+1}: {row.get('stacking_date')}")

    # Refresh token every 100 rows
    if (i + 1) % 100 == 0:
        token = get_token()

print(f"\nDone. Inserted: {inserted}, Skipped: {skipped}")
print(f"Query: SELECT * FROM {FULL} ORDER BY stacking_date DESC LIMIT 10")
