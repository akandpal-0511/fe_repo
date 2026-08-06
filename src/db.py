import random
from datetime import datetime, timedelta
import pandas as pd

# ── No-op cache ───────────────────────────────────────────────────────────────

def clear_cache():
    pass


# ── PA-13 limits (static, no DB needed) ──────────────────────────────────────

SCALE_UP_LIMITS: dict[str, dict[str, tuple]] = {
    "SIG-037": {"30 ˚C": (1.1, 1.3),  "50 ˚C": (1.1, 1.3),  "60 ˚C": (1.1, 1.3)},
    "SIG-038": {"30 ˚C": (750, 850),   "50 ˚C": (700, 800),   "60 ˚C": (650, 750)},
    "SIG-039": {"30 ˚C": (28, 30),     "50 ˚C": (48, 52),     "60 ˚C": (58, 62)},
    "SIG-040": {"30 ˚C": (95, 100),    "50 ˚C": (90, 100),    "60 ˚C": (60, 100)},
    "SIG-041": {"30 ˚C": (4, 10),      "50 ˚C": (4, 10),      "60 ˚C": (4, 10)},
    "SIG-042": {"30 ˚C": (0.1, 1),     "50 ˚C": (0.1, 1),     "60 ˚C": (0.1, 1)},
}

# ── Tag profiles (synthetic) ───────────────────────────────────────────────────

_TAG_PROFILES = [
    # PA-1
    {"Id": 101, "PerformanceArea": "PA-1", "Area": "PA-1", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-01", "Unit": "units/h", "Tag": "PA1.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 50.0, "UpperLimit": 120.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 102, "PerformanceArea": "PA-1", "Area": "PA-1", "Container": "UNIT-02", "Measure": "KPI-02", "Description": "KPI-02", "Unit": "units/h", "Tag": "PA1.UNIT02.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 0.0, "UpperLimit": 50.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 103, "PerformanceArea": "PA-1", "Area": "PA-1", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-03", "Unit": "units/h", "Tag": "PA1.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 100.0, "UpperLimit": 600.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-2
    {"Id": 201, "PerformanceArea": "PA-2", "Area": "PA-2", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-04", "Unit": "units/h", "Tag": "PA2.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 400.0, "UpperLimit": 1200.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 202, "PerformanceArea": "PA-2", "Area": "PA-2", "Container": "UNIT-01", "Measure": "KPI-02", "Description": "KPI-05", "Unit": "kW", "Tag": "PA2.UNIT01.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 100.0, "UpperLimit": 800.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 203, "PerformanceArea": "PA-2", "Area": "PA-2", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-06", "Unit": "mm", "Tag": "PA2.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 30.0, "UpperLimit": 80.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-3
    {"Id": 301, "PerformanceArea": "PA-3", "Area": "PA-3", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-07", "Unit": "%", "Tag": "PA3.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 8.0, "UpperLimit": 14.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 302, "PerformanceArea": "PA-3", "Area": "PA-3", "Container": "UNIT-01", "Measure": "KPI-02", "Description": "KPI-08", "Unit": "kg/t", "Tag": "PA3.UNIT01.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 5.0, "UpperLimit": 20.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 303, "PerformanceArea": "PA-3", "Area": "PA-3", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-09", "Unit": "rpm", "Tag": "PA3.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 5.0, "UpperLimit": 15.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-4
    {"Id": 401, "PerformanceArea": "PA-4", "Area": "PA-4", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-10", "Unit": "units/h", "Tag": "PA4.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 200.0, "UpperLimit": 900.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 402, "PerformanceArea": "PA-4", "Area": "PA-4", "Container": "UNIT-01", "Measure": "KPI-02", "Description": "KPI-11", "Unit": "m/s", "Tag": "PA4.UNIT01.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.0, "UpperLimit": 4.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 403, "PerformanceArea": "PA-4", "Area": "PA-4", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-12", "Unit": "m", "Tag": "PA4.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 0.0, "UpperLimit": 8.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-5
    {"Id": 501, "PerformanceArea": "PA-5", "Area": "PA-5", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-13", "Unit": "m³/h", "Tag": "PA5.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 50.0, "UpperLimit": 500.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 502, "PerformanceArea": "PA-5", "Area": "PA-5", "Container": "UNIT-01", "Measure": "KPI-02", "Description": "KPI-14", "Unit": "", "Tag": "PA5.UNIT01.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.5, "UpperLimit": 2.5, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 503, "PerformanceArea": "PA-5", "Area": "PA-5", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-15", "Unit": "L/h/m²", "Tag": "PA5.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 5.0, "UpperLimit": 20.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-6
    {"Id": 601, "PerformanceArea": "PA-6", "Area": "PA-6", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-16", "Unit": "g/L", "Tag": "PA6.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 2.0, "UpperLimit": 8.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 602, "PerformanceArea": "PA-6", "Area": "PA-6", "Container": "UNIT-02", "Measure": "KPI-02", "Description": "KPI-17", "Unit": "A/m²", "Tag": "PA6.UNIT02.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 150.0, "UpperLimit": 350.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 603, "PerformanceArea": "PA-6", "Area": "PA-6", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-18", "Unit": "m³/h", "Tag": "PA6.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 50.0, "UpperLimit": 300.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-7
    {"Id": 701, "PerformanceArea": "PA-7", "Area": "PA-7", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-19", "Unit": "g/L", "Tag": "PA7.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 0.1, "UpperLimit": 1.5, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 702, "PerformanceArea": "PA-7", "Area": "PA-7", "Container": "UNIT-01", "Measure": "KPI-02", "Description": "KPI-20", "Unit": "", "Tag": "PA7.UNIT01.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.4, "UpperLimit": 2.2, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 703, "PerformanceArea": "PA-7", "Area": "PA-7", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-21", "Unit": "m³/h", "Tag": "PA7.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 50.0, "UpperLimit": 400.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-8
    {"Id": 801, "PerformanceArea": "PA-8",  "Area": "PA-8",  "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-22", "Unit": "", "Tag": "PA8.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.0, "UpperLimit": 2.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 802, "PerformanceArea": "PA-8",  "Area": "PA-8",  "Container": "UNIT-02", "Measure": "KPI-02", "Description": "KPI-23", "Unit": "˚C", "Tag": "PA8.UNIT02.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 25.0, "UpperLimit": 45.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 803, "PerformanceArea": "PA-8",  "Area": "PA-8",  "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-24", "Unit": "mV", "Tag": "PA8.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 600.0, "UpperLimit": 850.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-9
    {"Id": 811, "PerformanceArea": "PA-9",  "Area": "PA-9",  "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-25", "Unit": "", "Tag": "PA9.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.0, "UpperLimit": 2.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 812, "PerformanceArea": "PA-9",  "Area": "PA-9",  "Container": "UNIT-01", "Measure": "KPI-02", "Description": "KPI-26", "Unit": "mV", "Tag": "PA9.UNIT01.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 600.0, "UpperLimit": 850.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 813, "PerformanceArea": "PA-9",  "Area": "PA-9",  "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-27", "Unit": "˚C", "Tag": "PA9.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 25.0, "UpperLimit": 45.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-10
    {"Id": 821, "PerformanceArea": "PA-10", "Area": "PA-10", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-28", "Unit": "˚C", "Tag": "PA10.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 25.0, "UpperLimit": 45.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 822, "PerformanceArea": "PA-10", "Area": "PA-10", "Container": "UNIT-01", "Measure": "KPI-02", "Description": "KPI-29", "Unit": "mg/L", "Tag": "PA10.UNIT01.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 0.1, "UpperLimit": 1.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 823, "PerformanceArea": "PA-10", "Area": "PA-10", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-30", "Unit": "", "Tag": "PA10.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.0, "UpperLimit": 2.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-11
    {"Id": 831, "PerformanceArea": "PA-11", "Area": "PA-11", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-31", "Unit": "mV", "Tag": "PA11.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 600.0, "UpperLimit": 850.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 832, "PerformanceArea": "PA-11", "Area": "PA-11", "Container": "UNIT-01", "Measure": "KPI-02", "Description": "KPI-32", "Unit": "g/L", "Tag": "PA11.UNIT01.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 4.0, "UpperLimit": 12.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 833, "PerformanceArea": "PA-11", "Area": "PA-11", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-33", "Unit": "", "Tag": "PA11.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.0, "UpperLimit": 2.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-12
    {"Id": 841, "PerformanceArea": "PA-12", "Area": "PA-12", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-34", "Unit": "m³/min", "Tag": "PA12.UNIT01.KPI01", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 100.0, "UpperLimit": 500.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 842, "PerformanceArea": "PA-12", "Area": "PA-12", "Container": "UNIT-01", "Measure": "KPI-02", "Description": "KPI-35", "Unit": "m³/h", "Tag": "PA12.UNIT01.KPI02", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 5.0, "UpperLimit": 30.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 843, "PerformanceArea": "PA-12", "Area": "PA-12", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-36", "Unit": "kPa", "Tag": "PA12.UNIT01.KPI03", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 50.0, "UpperLimit": 200.0, "DataSource": "Historian", "IsCalculated": False},
    # PA-13
    {"Id": 9001, "PerformanceArea": "PA-13", "Area": "PA-13", "Container": "UNIT-01", "Measure": "KPI-01", "Description": "KPI-37", "Unit": "", "Tag": "SIG-037", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.1, "UpperLimit": 1.3, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 9002, "PerformanceArea": "PA-13", "Area": "PA-13", "Container": "UNIT-01", "Measure": "KPI-02", "Description": "KPI-38", "Unit": "mV", "Tag": "SIG-038", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 650.0, "UpperLimit": 850.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 9003, "PerformanceArea": "PA-13", "Area": "PA-13", "Container": "UNIT-01", "Measure": "KPI-03", "Description": "KPI-39", "Unit": "˚C", "Tag": "SIG-039", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 28.0, "UpperLimit": 62.0, "DataSource": "Historian", "IsCalculated": False},
]


def getAllTagProfiles() -> pd.DataFrame:
    return pd.DataFrame(_TAG_PROFILES)


def getTagProfiles(area: str) -> pd.DataFrame:
    df = getAllTagProfiles()
    return (
        df[df["PerformanceArea"] == area]
        .sort_values(["IsCalculated", "DataSource", "Description"])
        .reset_index(drop=True)
    )


def getAllLatestValues() -> pd.DataFrame:
    rng = random.Random(42)
    now = datetime.utcnow().isoformat()
    rows = []
    for p in _TAG_PROFILES:
        lo = p["LowerLimit"] or 0.0
        hi = p["UpperLimit"] or 100.0
        val = lo + rng.random() * (hi - lo)
        rows.append({"Tag": p["Tag"], "Value": round(val, 3), "Timestamp_AZ": now})
    return pd.DataFrame(rows)


def getTrendData(tags: tuple, start_str: str, end_str: str) -> pd.DataFrame:
    if not tags:
        return pd.DataFrame()
    try:
        start = datetime.fromisoformat(start_str)
        end   = datetime.fromisoformat(end_str)
    except ValueError:
        start = datetime.utcnow() - timedelta(days=7)
        end   = datetime.utcnow()

    rng = random.Random(hash(str(sorted(tags))))
    rows = []
    for tag in tags:
        prof_row = next((p for p in _TAG_PROFILES if p["Tag"] == tag), None)
        lo = (prof_row["LowerLimit"] or 0.0) if prof_row else 0.0
        hi = (prof_row["UpperLimit"] or 100.0) if prof_row else 100.0
        val = lo + rng.random() * (hi - lo)
        ts = start
        while ts < end:
            step = rng.gauss(0, (hi - lo) * 0.02)
            val = max(lo * 0.8, min(hi * 1.2, val + step))
            rows.append({"Tag": tag, "Timestamp_AZ": ts.isoformat(), "Value": round(val, 3)})
            ts += timedelta(hours=1)
    return pd.DataFrame(rows)


def getGoldLatestRow(gold_table: str) -> pd.DataFrame:
    rng = random.Random(hash(gold_table))
    return pd.DataFrame([{
        "Year":             2024,
        "Week_Num":         24,
        "Cu_Produced_t":    round(rng.uniform(180, 260), 1),
        "Feed_Rate_thr":    round(rng.uniform(600, 900), 1),
        "Availability_pct": round(rng.uniform(82, 98), 1),
    }])


def getBigFAll():
    from constants import PA_SUB_AREAS
    from helpers import buildValLookup
    all_profiles = getAllTagProfiles()
    all_latest   = getAllLatestValues()
    profiles_by = {
        bf: all_profiles[all_profiles["PerformanceArea"] == bf].reset_index(drop=True)
        for bf in PA_SUB_AREAS
    }
    all_vals = buildValLookup(all_latest) if not all_latest.empty else {}
    vals_by = {bf: all_vals for bf in PA_SUB_AREAS}
    return profiles_by, vals_by





def getBioReactorDailyTrend(tags: tuple, start_str: str, end_str: str) -> pd.DataFrame:
    if not tags:
        return pd.DataFrame()
    try:
        start = datetime.fromisoformat(start_str)
        end   = datetime.fromisoformat(end_str)
    except ValueError:
        start = datetime.utcnow() - timedelta(days=30)
        end   = datetime.utcnow()

    RANGES = {
        "SIG-037": (1.1, 1.35),
        "SIG-038": (700, 820),
        "SIG-039": (28, 62),
    }
    containers = ["SU-01", "SU-02", "SU-03"]
    rng = random.Random(99)
    rows = []
    ts = start
    while ts < end:
        for container in containers:
            for tag in tags:
                lo, hi = RANGES.get(tag, (0.0, 100.0))
                val = lo + rng.random() * (hi - lo)
                rows.append({
                    "Date":        ts.isoformat(),
                    "Container":   container,
                    "Temperature": "30 ˚C",
                    "Volume":      round(rng.uniform(50, 200), 1),
                    "Measure":     tag,
                    "Value":       round(val, 3),
                })
        ts += timedelta(days=1)
    return pd.DataFrame(rows)


# ── Stacking dummy data ────────────────────────────────────────────────────────

_MATERIALS = ["Type-A", "Type-B", "Type-C", "Type-D", "Type-E"]


def get_stacking_data(mode: str = "prod") -> list[dict]:
    rng = random.Random(7 if mode == "prod" else 42)
    cells = ["A", "B", "C", "D", "E"]
    panels = [1, 2, 3, 4, 5]
    start_base = datetime(2024, 1, 1)
    cell_material = {cell: rng.choice(_MATERIALS) for cell in cells}
    rows = []
    for ci, cell in enumerate(cells):
        for pi, panel in enumerate(panels):
            stacking_order = ci * len(panels) + pi + 1
            tons_planned = round(rng.uniform(50_000, 200_000))
            days_planned = round(rng.uniform(14, 60), 2)
            start_date = start_base + timedelta(days=stacking_order * 5)
            end_date   = start_date + timedelta(days=days_planned)
            if stacking_order <= 12:
                status = "Complete"
                pct = 100.0
                actual_tons = round(tons_planned * rng.uniform(0.95, 1.05))
                delay_days = round(rng.uniform(-3, 5), 1)
                current_rate_tpd = None
                actual_start_ts = (start_date + timedelta(hours=rng.randint(0, 12))).strftime("%Y-%m-%dT%H:%M:%S")
                actual_end_ts = (end_date + timedelta(days=delay_days, hours=rng.randint(0, 8))).strftime("%Y-%m-%dT%H:%M:%S")
            elif stacking_order == 13:
                status = "In Progress"
                pct = round(rng.uniform(20, 85), 1)
                actual_tons = round(tons_planned * pct / 100)
                delay_days = round(rng.uniform(-1, 8), 1)
                current_rate_tpd = round(rng.uniform(400, 800))
                actual_start_ts = (start_date + timedelta(hours=rng.randint(0, 12))).strftime("%Y-%m-%dT%H:%M:%S")
                actual_end_ts = None
            else:
                status = "Not Started"
                pct = None
                actual_tons = None
                delay_days = None
                current_rate_tpd = None
                actual_start_ts = None
                actual_end_ts = None
            rows.append({
                "cell":                 cell,
                "panel":                panel,
                "material":             cell_material[cell],
                "stacking_order":       stacking_order,
                "tons_planned":         tons_planned,
                "actual_tons":          actual_tons,
                "days_stacked_planned": days_planned,
                "current_rate_tpd":     current_rate_tpd,
                "cell_start_date":      start_date.strftime("%Y-%m-%d"),
                "cell_end_date":        end_date.strftime("%Y-%m-%d"),
                "actual_start_ts":      actual_start_ts,
                "actual_end_ts":        actual_end_ts,
                "status":               status,
                "pct_complete":         pct,
                "delay_days":           delay_days,
            })
    return rows


def get_cell_allocation_3d(mode: str = "prod") -> list[dict]:
    rows = get_stacking_data(mode)
    return [
        {
            "panel":       r["cell"],
            "cell":        str(r["panel"]),
            "material":    r["material"],
            "tons_planned": r["tons_planned"],
            "tons_actual": r["actual_tons"],
            "days_planned": r["days_stacked_planned"],
            "days_actual": round(r["days_stacked_planned"] * (r["pct_complete"] / 100), 2)
                           if r["pct_complete"] is not None else None,
            "start_date":  r["cell_start_date"],
            "end_date":    r["cell_end_date"],
            "status":      r["status"],
        }
        for r in rows
    ]


def get_ore_feed_rate(days: int = 7) -> list[dict]:
    """5-minute interval ore feed rate data (dummy random walk)."""
    rng = random.Random(55)
    end = datetime.utcnow()
    start = end - timedelta(days=days)
    rows = []
    rate = 650.0  # t/hr starting value
    ts = start
    interval_hours = 5 / 60
    while ts <= end:
        step = rng.gauss(0, 15)
        rate = max(200.0, min(950.0, rate + step))
        tons_interval = round(rate * interval_hours, 3)
        rows.append({
            "ts":            ts.isoformat() + "Z",
            "rate_thr":      round(rate, 2),
            "tons_interval": tons_interval,
            "tag":           "TAG-001",
        })
        ts += timedelta(minutes=5)
    return rows
