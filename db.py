import random
from datetime import datetime, timedelta
import pandas as pd

# ── No-op cache ───────────────────────────────────────────────────────────────

def clear_cache():
    pass


# ── Scale Up Bio Reactor limits (static, no DB needed) ────────────────────────

SCALE_UP_LIMITS: dict[str, dict[str, tuple]] = {
    "pH":          {"30 ˚C": (1.1, 1.3),  "50 ˚C": (1.1, 1.3),  "60 ˚C": (1.1, 1.3)},
    "Eh (mV)":     {"30 ˚C": (750, 850),   "50 ˚C": (700, 800),   "60 ˚C": (650, 750)},
    "Temp (˚C)":   {"30 ˚C": (28, 30),     "50 ˚C": (48, 52),     "60 ˚C": (58, 62)},
    "Fe³⁺(%)":    {"30 ˚C": (95, 100),    "50 ˚C": (90, 100),    "60 ˚C": (60, 100)},
    "Fe Total":    {"30 ˚C": (4, 10),      "50 ˚C": (4, 10),      "60 ˚C": (4, 10)},
    "DO (mg/L)":   {"30 ˚C": (0.1, 1),     "50 ˚C": (0.1, 1),     "60 ˚C": (0.1, 1)},
}

# ── Tag profiles (synthetic) ───────────────────────────────────────────────────

_TAG_PROFILES = [
    # Mining
    {"Id": 101, "PerformanceArea": "Mining", "Area": "Mining", "Container": "Shovel-01", "Measure": "Payload", "Description": "Shovel Payload", "Unit": "t", "Tag": "MINING.SHOVEL01.PAYLOAD", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 50.0, "UpperLimit": 120.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 102, "PerformanceArea": "Mining", "Area": "Mining", "Container": "Truck-01", "Measure": "Speed", "Description": "Haul Truck Speed", "Unit": "km/h", "Tag": "MINING.TRUCK01.SPEED", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 0.0, "UpperLimit": 50.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 103, "PerformanceArea": "Mining", "Area": "Mining", "Container": "Shovel-01", "Measure": "Dig Rate", "Description": "Dig Rate", "Unit": "t/h", "Tag": "MINING.SHOVEL01.DIG_RATE", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 100.0, "UpperLimit": 600.0, "DataSource": "Historian", "IsCalculated": False},
    # Crushing
    {"Id": 201, "PerformanceArea": "Crushing", "Area": "Crushing", "Container": "Crusher-01", "Measure": "Feed Rate", "Description": "Primary Crusher Feed Rate", "Unit": "t/h", "Tag": "CRUSH.CR01.FEED_RATE", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 400.0, "UpperLimit": 1200.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 202, "PerformanceArea": "Crushing", "Area": "Crushing", "Container": "Crusher-01", "Measure": "Power", "Description": "Crusher Motor Power", "Unit": "kW", "Tag": "CRUSH.CR01.POWER", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 100.0, "UpperLimit": 800.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 203, "PerformanceArea": "Crushing", "Area": "Crushing", "Container": "Crusher-01", "Measure": "Gap", "Description": "Crusher CSS Gap", "Unit": "mm", "Tag": "CRUSH.CR01.CSS_GAP", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 30.0, "UpperLimit": 80.0, "DataSource": "Historian", "IsCalculated": False},
    # Agglomeration
    {"Id": 301, "PerformanceArea": "Agglomeration", "Area": "Agglomeration", "Container": "Agglom-01", "Measure": "Moisture", "Description": "Agglomeration Moisture", "Unit": "%", "Tag": "AGGL.AG01.MOISTURE", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 8.0, "UpperLimit": 14.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 302, "PerformanceArea": "Agglomeration", "Area": "Agglomeration", "Container": "Agglom-01", "Measure": "Acid Addition", "Description": "Acid Addition Rate", "Unit": "kg/t", "Tag": "AGGL.AG01.ACID_RATE", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 5.0, "UpperLimit": 20.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 303, "PerformanceArea": "Agglomeration", "Area": "Agglomeration", "Container": "Agglom-01", "Measure": "Drum Speed", "Description": "Agglom Drum Speed", "Unit": "rpm", "Tag": "AGGL.AG01.DRUM_SPEED", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 5.0, "UpperLimit": 15.0, "DataSource": "Historian", "IsCalculated": False},
    # Stacking
    {"Id": 401, "PerformanceArea": "Stacking", "Area": "Stacking", "Container": "Stacker-01", "Measure": "Ore Feed Rate", "Description": "Ore Feed Rate", "Unit": "t/h", "Tag": "STACK.SK01.FEED_RATE", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 200.0, "UpperLimit": 900.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 402, "PerformanceArea": "Stacking", "Area": "Stacking", "Container": "Stacker-01", "Measure": "Belt Speed", "Description": "Conveyor Belt Speed", "Unit": "m/s", "Tag": "STACK.SK01.BELT_SPEED", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.0, "UpperLimit": 4.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 403, "PerformanceArea": "Stacking", "Area": "Stacking", "Container": "Stacker-01", "Measure": "Stack Height", "Description": "Lift Stack Height", "Unit": "m", "Tag": "STACK.SK01.STACK_HEIGHT", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 0.0, "UpperLimit": 8.0, "DataSource": "Historian", "IsCalculated": False},
    # Leaching
    {"Id": 501, "PerformanceArea": "Leaching", "Area": "Leaching", "Container": "Heap-01", "Measure": "PLS Flow", "Description": "PLS Flow Rate", "Unit": "m³/h", "Tag": "LEACH.HP01.PLS_FLOW", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 50.0, "UpperLimit": 500.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 502, "PerformanceArea": "Leaching", "Area": "Leaching", "Container": "Heap-01", "Measure": "pH", "Description": "Heap pH", "Unit": "", "Tag": "LEACH.HP01.PH", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.5, "UpperLimit": 2.5, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 503, "PerformanceArea": "Leaching", "Area": "Leaching", "Container": "Heap-01", "Measure": "Irrigation Rate", "Description": "Heap Irrigation Rate", "Unit": "L/h/m²", "Tag": "LEACH.HP01.IRRIG_RATE", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 5.0, "UpperLimit": 20.0, "DataSource": "Historian", "IsCalculated": False},
    # PLS SX EW
    {"Id": 601, "PerformanceArea": "PLS SX EW", "Area": "PLS SX EW", "Container": "SX-01", "Measure": "Cu Grade", "Description": "PLS Cu Concentration", "Unit": "g/L", "Tag": "PLSSX.SX01.CU_GRADE", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 2.0, "UpperLimit": 8.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 602, "PerformanceArea": "PLS SX EW", "Area": "PLS SX EW", "Container": "EW-01", "Measure": "Current Density", "Description": "EW Current Density", "Unit": "A/m²", "Tag": "PLSSX.EW01.CURRENT", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 150.0, "UpperLimit": 350.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 603, "PerformanceArea": "PLS SX EW", "Area": "PLS SX EW", "Container": "SX-01", "Measure": "Loaded Organic Flow", "Description": "Loaded Organic Flow", "Unit": "m³/h", "Tag": "PLSSX.SX01.ORG_FLOW", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 50.0, "UpperLimit": 300.0, "DataSource": "Historian", "IsCalculated": False},
    # Raffinate
    {"Id": 701, "PerformanceArea": "Raffinate", "Area": "Raffinate", "Container": "Pond-01", "Measure": "Cu", "Description": "Raffinate Cu Concentration", "Unit": "g/L", "Tag": "RAFF.PD01.CU", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 0.1, "UpperLimit": 1.5, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 702, "PerformanceArea": "Raffinate", "Area": "Raffinate", "Container": "Pond-01", "Measure": "pH", "Description": "Raffinate pH", "Unit": "", "Tag": "RAFF.PD01.PH", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.4, "UpperLimit": 2.2, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 703, "PerformanceArea": "Raffinate", "Area": "Raffinate", "Container": "Pond-01", "Measure": "Flow", "Description": "Raffinate Flow Rate", "Unit": "m³/h", "Tag": "RAFF.PD01.FLOW", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 50.0, "UpperLimit": 400.0, "DataSource": "Historian", "IsCalculated": False},
    # BIGF1
    {"Id": 801, "PerformanceArea": "BIGF1", "Area": "BIGF1", "Container": "BIGF1-R01", "Measure": "pH", "Description": "pH", "Unit": "", "Tag": "BIGF1.R01.PH", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.0, "UpperLimit": 2.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 802, "PerformanceArea": "BIGF1", "Area": "BIGF1", "Container": "BIGF1-R02", "Measure": "Temp", "Description": "Temperature", "Unit": "˚C", "Tag": "BIGF1.R02.TEMP", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 25.0, "UpperLimit": 45.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 803, "PerformanceArea": "BIGF1", "Area": "BIGF1", "Container": "BIGF1-R01", "Measure": "Eh", "Description": "Redox Potential", "Unit": "mV", "Tag": "BIGF1.R01.EH", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 600.0, "UpperLimit": 850.0, "DataSource": "Historian", "IsCalculated": False},
    # BIGF2
    {"Id": 811, "PerformanceArea": "BIGF2", "Area": "BIGF2", "Container": "BIGF2-R01", "Measure": "pH", "Description": "pH", "Unit": "", "Tag": "BIGF2.R01.PH", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.0, "UpperLimit": 2.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 812, "PerformanceArea": "BIGF2", "Area": "BIGF2", "Container": "BIGF2-R01", "Measure": "Eh", "Description": "Redox Potential", "Unit": "mV", "Tag": "BIGF2.R01.EH", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 600.0, "UpperLimit": 850.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 813, "PerformanceArea": "BIGF2", "Area": "BIGF2", "Container": "BIGF2-R01", "Measure": "Temp", "Description": "Temperature", "Unit": "˚C", "Tag": "BIGF2.R01.TEMP", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 25.0, "UpperLimit": 45.0, "DataSource": "Historian", "IsCalculated": False},
    # BIGF3
    {"Id": 821, "PerformanceArea": "BIGF3", "Area": "BIGF3", "Container": "BIGF3-R01", "Measure": "Temp", "Description": "Temperature", "Unit": "˚C", "Tag": "BIGF3.R01.TEMP", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 25.0, "UpperLimit": 45.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 822, "PerformanceArea": "BIGF3", "Area": "BIGF3", "Container": "BIGF3-R01", "Measure": "DO", "Description": "Dissolved Oxygen", "Unit": "mg/L", "Tag": "BIGF3.R01.DO", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 0.1, "UpperLimit": 1.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 823, "PerformanceArea": "BIGF3", "Area": "BIGF3", "Container": "BIGF3-R01", "Measure": "pH", "Description": "pH", "Unit": "", "Tag": "BIGF3.R01.PH", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.0, "UpperLimit": 2.0, "DataSource": "Historian", "IsCalculated": False},
    # BIGF4
    {"Id": 831, "PerformanceArea": "BIGF4", "Area": "BIGF4", "Container": "BIGF4-R01", "Measure": "Eh", "Description": "Redox Potential", "Unit": "mV", "Tag": "BIGF4.R01.EH", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 600.0, "UpperLimit": 850.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 832, "PerformanceArea": "BIGF4", "Area": "BIGF4", "Container": "BIGF4-R01", "Measure": "Fe Total", "Description": "Total Iron", "Unit": "g/L", "Tag": "BIGF4.R01.FE_TOT", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 4.0, "UpperLimit": 12.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 833, "PerformanceArea": "BIGF4", "Area": "BIGF4", "Container": "BIGF4-R01", "Measure": "pH", "Description": "pH", "Unit": "", "Tag": "BIGF4.R01.PH", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.0, "UpperLimit": 2.0, "DataSource": "Historian", "IsCalculated": False},
    # BIGF Common Skid
    {"Id": 841, "PerformanceArea": "BIGF Common Skid", "Area": "BIGF Common Skid", "Container": "BIGF-CS", "Measure": "Air Flow", "Description": "Air Flow Rate", "Unit": "m³/min", "Tag": "BIGFCS.AIRFLOW", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 100.0, "UpperLimit": 500.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 842, "PerformanceArea": "BIGF Common Skid", "Area": "BIGF Common Skid", "Container": "BIGF-CS", "Measure": "Media Flow", "Description": "Media Feed Rate", "Unit": "m³/h", "Tag": "BIGFCS.MEDIA_FLOW", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 5.0, "UpperLimit": 30.0, "DataSource": "Historian", "IsCalculated": False},
    {"Id": 843, "PerformanceArea": "BIGF Common Skid", "Area": "BIGF Common Skid", "Container": "BIGF-CS", "Measure": "Pressure", "Description": "Air Supply Pressure", "Unit": "kPa", "Tag": "BIGFCS.AIR_PRESSURE", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 50.0, "UpperLimit": 200.0, "DataSource": "Historian", "IsCalculated": False},
    # Scale Up Bioreactors
    {"Id": 9001, "PerformanceArea": "Scale Up Bioreactors", "Area": "Scale Up", "Container": "Scale Up", "Measure": "pH", "Description": "pH", "Unit": "", "Tag": "pH", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 1.1, "UpperLimit": 1.3, "DataSource": "Bio Reactor", "IsCalculated": False},
    {"Id": 9002, "PerformanceArea": "Scale Up Bioreactors", "Area": "Scale Up", "Container": "Scale Up", "Measure": "Redox Potential", "Description": "Redox Potential", "Unit": "mV", "Tag": "Eh (mV)", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 650.0, "UpperLimit": 850.0, "DataSource": "Bio Reactor", "IsCalculated": False},
    {"Id": 9003, "PerformanceArea": "Scale Up Bioreactors", "Area": "Scale Up", "Container": "Scale Up", "Measure": "Temperature", "Description": "Temperature", "Unit": "˚C", "Tag": "Temp (˚C)", "ValueType": "DOUBLE", "Statistic": "Mean", "LowerLimit": 28.0, "UpperLimit": 62.0, "DataSource": "Bio Reactor", "IsCalculated": False},
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
    from constants import BIGF_AREAS
    from helpers import buildValLookup
    all_profiles = getAllTagProfiles()
    all_latest   = getAllLatestValues()
    profiles_by = {
        bf: all_profiles[all_profiles["PerformanceArea"] == bf].reset_index(drop=True)
        for bf in BIGF_AREAS
    }
    all_vals = buildValLookup(all_latest) if not all_latest.empty else {}
    vals_by = {bf: all_vals for bf in BIGF_AREAS}
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
        "pH":        (1.1, 1.35),
        "Eh (mV)":   (700, 820),
        "Temp (˚C)": (28, 62),
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

_MATERIALS = ["Non-core BQ", "Non-core blend", "PV", "Core edge", "Core"]


def get_stacking_data(mode: str = "prod") -> list[dict]:
    rng = random.Random(7 if mode == "prod" else 42)
    cells = ["A", "B", "C", "D", "E"]
    panels = [1, 2, 3, 4, 5]
    start_base = datetime(2024, 1, 1)
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
            elif stacking_order <= 18:
                status = "In Progress"
                pct = round(rng.uniform(20, 85), 1)
                actual_tons = round(tons_planned * pct / 100)
                delay_days = round(rng.uniform(-1, 8), 1)
            else:
                status = "Not Started"
                pct = None
                actual_tons = None
                delay_days = None
            rows.append({
                "cell":                 cell,
                "panel":                panel,
                "material":             rng.choice(_MATERIALS),
                "stacking_order":       stacking_order,
                "tons_planned":         tons_planned,
                "actual_tons":          actual_tons,
                "days_stacked_planned": days_planned,
                "cell_start_date":      start_date.strftime("%Y-%m-%d"),
                "cell_end_date":        end_date.strftime("%Y-%m-%d"),
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
        })
        ts += timedelta(minutes=5)
    return rows
