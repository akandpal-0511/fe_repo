import pandas as pd

from constants import ST_OK, ST_WARN, ST_ALARM, ST_OFF


def _lim(v):
    if v is None or (isinstance(v, float) and (pd.isna(v) or v <= -999)):
        return None
    return float(v)


def statusColor(val, lo_raw, hi_raw) -> str:
    lo, hi = _lim(lo_raw), _lim(hi_raw)
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ST_OFF
    if (lo is not None and val < lo) or (hi is not None and val > hi):
        return ST_ALARM
    if lo is not None and lo != 0 and val < lo * 1.10:
        return ST_WARN
    if hi is not None and hi != 0 and val > hi * 0.90:
        return ST_WARN
    if lo is None and hi is None:
        return ST_OFF
    return ST_OK


def fmtVal(val, unit: str = "") -> str:
    unit = unit or ""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return "—"
    if isinstance(val, float):
        if abs(val) >= 10_000:
            return f"{val:,.0f} {unit}".strip()
        if abs(val) >= 100:
            return f"{val:.1f} {unit}".strip()
        return f"{val:.2f} {unit}".strip()
    return f"{val} {unit}".strip()


def buildValLookup(df: pd.DataFrame) -> dict:
    if df.empty:
        return {}
    return {r["Tag"]: r["Value"] for _, r in df.iterrows()}


def findTagVal(profiles: pd.DataFrame, val_lookup: dict, keywords: list):
    """Return (tag, val, unit, lo, hi) for first tag whose Description matches any keyword."""
    for _, r in profiles.iterrows():
        desc = str(r.get("Description", "")).lower()
        if any(kw.lower() in desc for kw in keywords):
            tag = r["Tag"]
            val = val_lookup.get(tag)
            return tag, val, r.get("Unit", ""), _lim(r.get("LowerLimit")), _lim(r.get("UpperLimit"))
    return None, None, "", None, None


def isBinary(val) -> bool:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return False
    return val in (0, 1, 0.0, 1.0)
