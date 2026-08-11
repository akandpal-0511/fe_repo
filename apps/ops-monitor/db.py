import random
from datetime import datetime, timedelta
import pandas as pd

# ── No-op cache ───────────────────────────────────────────────────────────────

def clear_cache():
    pass


# ── Synthetic sensor catalogue ─────────────────────────────────────────────────
# A commodity-neutral mining flowsheet. Every process area below applies to any
# metal (gold, silver, copper, …) — the first step of every mine is Mining (PA-1),
# then Crushing, Grinding, and so on down the value chain. Tags/values are all
# synthetic and generated on the fly; nothing here is customer data.

# (PerformanceArea, [(description, unit, lo, hi), ...])
_AREA_SENSORS: list[tuple[str, list[tuple]]] = [
    ("PA-1", [   # Mining
        ("Ore Mined – Primary",        "t/h", 800.0, 2200.0),
        ("Ore Mined – Secondary",      "t/h", 400.0, 1500.0),
        ("Waste Stripping Rate",       "t/h", 500.0, 3000.0),
        ("Run-of-Mine Stockpile",      "kt",  20.0,  120.0),
        ("Head Grade (ROM)",           "g/t", 0.5,   6.0),
    ]),
    ("PA-2", [   # Crushing
        ("Primary Crusher Throughput", "t/h", 1000.0, 3000.0),
        ("Crusher Power Draw",         "kW",  200.0,  1200.0),
        ("Closed-Side Setting",        "mm",  30.0,   90.0),
        ("Crushed Product P80",        "mm",  8.0,    25.0),
    ]),
    ("PA-3", [   # Grinding / Milling
        ("SAG Mill Throughput",        "t/h", 600.0,  1600.0),
        ("Mill Power Draw",            "kW",  4000.0, 12000.0),
        ("Grind Size P80",             "µm",  75.0,   250.0),
        ("Mill Load",                  "%",   25.0,   40.0),
    ]),
    ("PA-4", [   # Material Handling
        ("Conveyor Feed Rate",         "t/h", 500.0,  2500.0),
        ("Belt Speed",                 "m/s", 1.0,    4.0),
        ("Stockpile Level",            "%",   10.0,   95.0),
        ("Reclaim Rate",               "t/h", 300.0,  1800.0),
    ]),
    ("PA-5", [   # Leaching
        ("Leach Feed Rate",            "m³/h", 50.0,  500.0),
        ("Slurry Density",             "% w/w", 30.0, 50.0),
        ("Reagent Addition Rate",      "kg/t", 0.2,   3.0),
        ("Leach Residence Time",       "h",    6.0,   48.0),
        ("Pulp pH",                    "pH",   1.5,   11.0),
    ]),
    ("PA-6", [   # Concentration
        ("Flotation Feed Rate",        "t/h", 200.0,  900.0),
        ("Concentrate Grade",          "%",   18.0,   32.0),
        ("Recovery",                   "%",   82.0,   96.0),
        ("Froth Depth",                "mm",  30.0,   80.0),
        ("Air Flow Rate",              "m³/min", 5.0, 30.0),
    ]),
    ("PA-7", [   # Solution Processing
        ("Solution Flow Rate",         "m³/h", 100.0, 800.0),
        ("Metal Tenor",                "g/L",  0.5,   8.0),
        ("Feed Solution pH",           "pH",   1.0,   4.0),
        ("Solution Temperature",       "°C",   20.0,  45.0),
    ]),
    ("PA-8", [   # Recovery
        ("Recovery Circuit Current",   "A",   20000.0, 30000.0),
        ("Current Efficiency",         "%",   85.0,  98.0),
        ("Metal Deposition Rate",      "kg/h", 50.0, 400.0),
        ("Circuit Temperature",        "°C",  25.0,  55.0),
    ]),
    ("PA-9", [   # Product / Refining
        ("Final Product Rate",         "t/d", 50.0,  400.0),
        ("Product Purity",             "%",   98.5,  99.99),
        ("Moisture Content",           "%",   0.1,   8.0),
        ("Product Grade",              "%",   90.0,  99.9),
    ]),
    ("PA-10", [  # Reagents
        ("Reagent A Consumption",      "kg/t", 1.0,  15.0),
        ("Reagent B Consumption",      "kg/t", 0.5,  10.0),
        ("Reagent Inventory",          "t",   5.0,   200.0),
        ("Dosing Rate",                "L/min", 2.0,  30.0),
    ]),
    ("PA-11", [  # Water & Solution Balance
        ("Fresh Water Make-up",        "m³/h", 50.0,  500.0),
        ("Process Water Recycle",      "%",   40.0,   90.0),
        ("Pond Level",                 "%",   20.0,   95.0),
        ("Solution pH",                "pH",   4.0,   12.0),
    ]),
    ("PA-12", [  # Tailings
        ("Tailings Flow Rate",         "m³/h", 100.0, 900.0),
        ("Tailings Density",           "% w/w", 45.0, 65.0),
        ("Dam Pond Level",             "m",   0.0,    8.0),
        ("Seepage Flow",               "L/min", 0.1,  20.0),
    ]),
    ("PA-13", [  # Assays & Met Accounting
        ("Head Assay",                 "g/t", 0.5,   8.0),
        ("Concentrate Assay",          "%",   18.0,  32.0),
        ("Tailings Assay",             "g/t", 0.05,  0.8),
        ("Metallurgical Balance",      "%",   95.0,  102.0),
    ]),
]


def _build_profiles() -> list[dict]:
    """Flatten the area/sensor catalogue into tag-profile rows."""
    rows: list[dict] = []
    tid = 100
    for pa, sensors in _AREA_SENSORS:
        pa_num = pa.split("-")[1]
        for si, (desc, unit, lo, hi) in enumerate(sensors, start=1):
            tid += 1
            rows.append({
                "Id":              tid,
                "PerformanceArea": pa,
                "Area":            pa,
                "Container":       f"UNIT-{si:02d}",
                "Measure":         f"KPI-{si:02d}",
                "Description":     desc,
                "Unit":            unit,
                "Tag":             f"PA{pa_num}.UNIT{si:02d}.M{si:02d}",
                "ValueType":       "DOUBLE",
                "Statistic":       "Mean",
                "LowerLimit":      float(lo),
                "UpperLimit":      float(hi),
                "DataSource":      "Historian",
                "IsCalculated":    False,
            })
    return rows


_TAG_PROFILES = _build_profiles()


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
        "Metal_Produced_t": round(rng.uniform(180, 260), 1),
        "Feed_Rate_thr":    round(rng.uniform(600, 900), 1),
        "Availability_pct": round(rng.uniform(82, 98), 1),
    }])


# ── Plan Status dummy data (planned vs actual by panel / block) ─────────────────

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
