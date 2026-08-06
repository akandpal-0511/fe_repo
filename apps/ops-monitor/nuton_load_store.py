"""
In-memory store for daily Nuton Load entries.
Seeded from the synthetic Excel on first import; new submissions append to it.
"""

from pathlib import Path
from typing import Optional
import math
import pandas as pd

_EXCEL = Path(__file__).parent / "data" / "synthetic_physicals_master.xlsx"

# ── seed from Excel ──────────────────────────────────────────────────────────
def _load_seed() -> list[dict]:
    if not _EXCEL.exists():
        return []
    df = pd.read_excel(_EXCEL, sheet_name="Nuton Load", engine="openpyxl")
    df["report_date"] = pd.to_datetime(df["report_date"]).dt.strftime("%Y-%m-%d")
    records = df.where(pd.notna(df), None).to_dict(orient="records")
    # replace float NaN/inf that slip through
    def _clean(v):
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v
    return [{k: _clean(v) for k, v in row.items()} for row in records]


_rows: list[dict] = _load_seed()
_next_id: int = len(_rows) + 1


# ── public API ───────────────────────────────────────────────────────────────
def get_all(limit: int = 100, offset: int = 0) -> list[dict]:
    """Return entries newest-first."""
    sliced = list(reversed(_rows))[offset : offset + limit]
    return sliced


def get_by_date(report_date: str) -> Optional[dict]:
    for row in _rows:
        if row.get("report_date") == report_date:
            return row
    return None


def upsert(entry: dict) -> dict:
    """Insert or replace the row for entry['report_date']."""
    global _next_id
    date = entry["report_date"]
    for i, row in enumerate(_rows):
        if row.get("report_date") == date:
            _rows[i] = entry
            return entry
    entry["_id"] = _next_id
    _next_id += 1
    _rows.append(entry)
    return entry
