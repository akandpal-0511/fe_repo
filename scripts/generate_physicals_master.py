"""
Generate a synthetic Physicals Master Excel file.

Three sheets:
  1. Nuton Load   — 90 days of raw operator input (bronze columns)
  2. Daily Report — same 90 days, columns auto-derived from Nuton Load
  3. Report       — monthly aggregates (gold columns)

All metric names and any site-specific language have been genericised.
Run:
    python scripts/generate_physicals_master.py
Outputs:
    docs/synthetic_physicals_master.xlsx
"""

from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

# ── reproducibility ─────────────────────────────────────────────────────────
RNG = np.random.default_rng(42)

# ── date range ───────────────────────────────────────────────────────────────
START = date(2025, 1, 1)
DAYS = 90
dates = [START + timedelta(days=i) for i in range(DAYS)]


# ── helpers ──────────────────────────────────────────────────────────────────
def rnd(lo, hi, size=DAYS, decimals=2):
    return np.round(RNG.uniform(lo, hi, size), decimals)


def with_zeros(arr, zero_prob=0.05):
    mask = RNG.random(len(arr)) < zero_prob
    arr = arr.copy().astype(float)
    arr[mask] = 0.0
    return arr


def flow_weighted_avg(grade, flow):
    denom = np.sum(flow)
    return float(np.sum(grade * flow) / denom) if denom else 0.0


def avg_nonzero(series):
    pos = series[series > 0]
    return float(pos.mean()) if len(pos) else 0.0


# ── 1. NUTON LOAD TAB ────────────────────────────────────────────────────────
crushed_d = with_zeros(rnd(0, 5000, decimals=0))
crushed_n = with_zeros(rnd(0, 5000, decimals=0))
wet_total_crushed = crushed_d + crushed_n
dry_crushed = np.round(wet_total_crushed * rnd(0.90, 0.97), 0)
stacked_d = with_zeros(rnd(0, 5000, decimals=0))
stacked_n = with_zeros(rnd(0, 5000, decimals=0))
total_stacked = stacked_d + stacked_n

grade_tcu = rnd(0.10, 0.60)
grade_ascu = rnd(0.05, 0.40)
grade_cucn = rnd(0.001, 0.050, decimals=4)
grade_cus = rnd(0.01, 0.10)
acid_cons = rnd(5, 30)

mining_primary = with_zeros(rnd(0, 50000, decimals=0), zero_prob=0.10)
mining_secondary = with_zeros(rnd(0, 30000, decimals=0), zero_prob=0.10)
mining_tertiary = with_zeros(rnd(0, 20000, decimals=0), zero_prob=0.10)

raff_a_acid_cure_flow = with_zeros(rnd(0, 500))
raff_a_main_flow = with_zeros(rnd(1500, 2500))
raff_a_cu_grade = rnd(0.01, 0.50)
raff_a_acid_grade = rnd(1, 10)

raff_b_pad_flow = with_zeros(rnd(500, 2000))
raff_b_cu_grade = rnd(0.01, 0.40)
raff_b_acid_grade = rnd(1, 8)

pls_b_flow = with_zeros(rnd(500, 2000))
pls_b_cu_grade = rnd(0.5, 5.0)
pls_b_acid = rnd(0.1, 2.0)
pls_b_ph = rnd(1.0, 4.0)

pls_a_flow = with_zeros(rnd(1000, 3000))
pls_a_cu_grade = rnd(0.5, 5.0)
pls_a_acid = rnd(0.1, 2.0)
pls_a_ph = rnd(1.0, 4.0)

ew_b1_amps = with_zeros(rnd(20000, 30000, decimals=0), zero_prob=0.03)
ew_b2_amps = with_zeros(rnd(20000, 30000, decimals=0), zero_prob=0.03)
ew_b1_eff = rnd(0.85, 0.98)
ew_b2_eff = rnd(0.85, 0.98)
cu_harvested = with_zeros(rnd(0, 100000, decimals=0), zero_prob=0.07)

acid_delivered = with_zeros(rnd(0, 500, decimals=1), zero_prob=0.20)
acid_sx = rnd(0, 100, decimals=1)
acid_cure_a = rnd(0, 200, decimals=1)
acid_cure_b = rnd(0, 200, decimals=1)
acid_aux = rnd(0, 100, decimals=1)
acid_hl_total = rnd(0, 500, decimals=1)
acid_consumed = acid_sx + acid_cure_a + acid_cure_b + acid_aux

nl = pd.DataFrame({
    "report_date": dates,
    "crushed_d_tons": crushed_d,
    "crushed_n_tons": crushed_n,
    "wet_total_crushed_tons": wet_total_crushed,
    "dry_crushed_tons": dry_crushed,
    "stacked_d_tons": stacked_d,
    "stacked_n_tons": stacked_n,
    "total_stacked_tons": total_stacked,
    "grade_tcu_pct": grade_tcu,
    "grade_ascu_pct": grade_ascu,
    "grade_cucn_pct": grade_cucn,
    "grade_cus_pct": grade_cus,
    "acid_cons_lb_per_t": acid_cons,
    "mining_tons_primary": mining_primary,
    "mining_tons_secondary": mining_secondary,
    "mining_tons_tertiary": mining_tertiary,
    "raffinate_a_acid_cure_flow_gpm": raff_a_acid_cure_flow,
    "raffinate_a_main_flow_gpm": raff_a_main_flow,
    "raffinate_a_cu_grade_g_l": raff_a_cu_grade,
    "raffinate_a_acid_grade_g_l": raff_a_acid_grade,
    "raffinate_b_pad_flow_gpm": raff_b_pad_flow,
    "raffinate_b_cu_grade_g_l": raff_b_cu_grade,
    "raffinate_b_acid_grade_g_l": raff_b_acid_grade,
    "pls_b_flow_gpm": pls_b_flow,
    "pls_b_cu_grade_g_l": pls_b_cu_grade,
    "pls_b_acid_g_l": pls_b_acid,
    "pls_b_ph": pls_b_ph,
    "pls_a_flow_gpm": pls_a_flow,
    "pls_a_cu_grade_g_l": pls_a_cu_grade,
    "pls_a_acid_g_l": pls_a_acid,
    "pls_a_ph": pls_a_ph,
    "ew_block1_dc_amps": ew_b1_amps,
    "ew_block2_dc_amps": ew_b2_amps,
    "ew_block1_efficiency": ew_b1_eff,
    "ew_block2_efficiency": ew_b2_eff,
    "total_cu_harvested_lb": cu_harvested,
    "acid_delivered_short_tons": acid_delivered,
    "acid_sx_usage_short_tons": acid_sx,
    "acid_cure_a_totalizer_st": acid_cure_a,
    "acid_cure_b_totalizer_st": acid_cure_b,
    "acid_auxiliary_totalizer_st": acid_aux,
    "acid_heap_leach_total_st": acid_hl_total,
    "total_acid_consumed_short_tons": acid_consumed,
})


# ── 2. DAILY REPORT TAB ──────────────────────────────────────────────────────
sx_feed_flow = raff_a_main_flow + raff_a_acid_cure_flow + raff_b_pad_flow

dr = pd.DataFrame({
    "report_date": dates,
    "ore_delivered_primary_tons": mining_primary,
    "ore_delivered_secondary_tons": mining_secondary,
    "ore_delivered_wet_crushed_tons": wet_total_crushed,
    "ore_delivered_total_stacked_tons": total_stacked,
    "raffinate_a_flow_gpm": raff_a_main_flow,
    "raffinate_a_cu_grade_g_l": raff_a_cu_grade,
    "raffinate_b_flow_gpm": raff_b_pad_flow,
    "raffinate_b_cu_grade_g_l": raff_b_cu_grade,
    "pls_a_flow_gpm": pls_a_flow,
    "pls_a_cu_grade_g_l": pls_a_cu_grade,
    "pls_b_flow_gpm": pls_b_flow,
    "pls_b_cu_grade_g_l": pls_b_cu_grade,
    "sx_feed_flow_gpm": sx_feed_flow,
    "ew_cathode_harvest_lb": cu_harvested,
    "acid_consumed_st": acid_consumed,
    "acid_sx_usage_st": acid_sx,
    "acid_cure_a_st": acid_cure_a,
    "acid_cure_b_st": acid_cure_b,
    "acid_auxiliary_st": acid_aux,
    "acid_delivered_st": acid_delivered,
    "grade_tcu_pct": grade_tcu,
    "grade_ascu_pct": grade_ascu,
    "dry_crushed_tons": dry_crushed,
})


# ── 3. REPORT TAB (monthly aggregates) ───────────────────────────────────────
month_col = pd.to_datetime(nl["report_date"]).dt.to_period("M")
nl_m = nl.assign(_month=month_col)
dr_m = dr.assign(_month=month_col)

report_rows = []
for month, grp_nl in nl_m.groupby("_month"):
    grp_dr = dr_m[dr_m["_month"] == month]
    g = grp_nl  # shorthand

    def fwa(grade_col, flow_col):
        return flow_weighted_avg(g[grade_col].values, g[flow_col].values)

    row = {
        "month": str(month),
        # Stacking
        "total_crushed_tons": g["wet_total_crushed_tons"].sum(),
        "dry_crushed_tons": g["dry_crushed_tons"].sum(),
        "total_stacked_tons": g["total_stacked_tons"].sum(),
        "grade_tcu_pct": fwa("grade_tcu_pct", "total_stacked_tons"),
        "grade_ascu_pct": fwa("grade_ascu_pct", "total_stacked_tons"),
        "ton_tcu": float((g["grade_tcu_pct"] * g["total_stacked_tons"]).sum()),
        # Mining
        "mining_primary_tons": g["mining_tons_primary"].sum(),
        "mining_secondary_tons": g["mining_tons_secondary"].sum(),
        "mining_tertiary_tons": g["mining_tons_tertiary"].sum(),
        # Raffinate Zone-A
        "raffinate_a_avg_flow_gpm": avg_nonzero(g["raffinate_a_main_flow_gpm"]),
        "raffinate_a_cu_grade_g_l": fwa("raffinate_a_cu_grade_g_l", "raffinate_a_main_flow_gpm"),
        "raffinate_a_acid_mass_st": g["acid_cure_a_totalizer_st"].sum(),
        # Raffinate Zone-B
        "raffinate_b_avg_flow_gpm": avg_nonzero(g["raffinate_b_pad_flow_gpm"]),
        "raffinate_b_cu_grade_g_l": fwa("raffinate_b_cu_grade_g_l", "raffinate_b_pad_flow_gpm"),
        "raffinate_b_acid_totalizer_st": g["acid_cure_b_totalizer_st"].sum(),
        # PLS Zone-B
        "pls_b_avg_flow_gpm": avg_nonzero(g["pls_b_flow_gpm"]),
        "pls_b_cu_grade_g_l": fwa("pls_b_cu_grade_g_l", "pls_b_flow_gpm"),
        # PLS Zone-A
        "pls_a_avg_flow_gpm": avg_nonzero(g["pls_a_flow_gpm"]),
        "pls_a_cu_grade_g_l": fwa("pls_a_cu_grade_g_l", "pls_a_flow_gpm"),
        # EW
        "ew_block1_avg_amps": avg_nonzero(g["ew_block1_dc_amps"]),
        "ew_block2_avg_amps": avg_nonzero(g["ew_block2_dc_amps"]),
        "ew_block1_avg_efficiency": avg_nonzero(g["ew_block1_efficiency"]),
        "ew_block2_avg_efficiency": avg_nonzero(g["ew_block2_efficiency"]),
        "total_cu_harvested_lb": g["total_cu_harvested_lb"].sum(),
        # Acid
        "acid_consumed_total_st": g["total_acid_consumed_short_tons"].sum(),
        "acid_sx_usage_st": g["acid_sx_usage_short_tons"].sum(),
        "acid_delivered_st": g["acid_delivered_short_tons"].sum(),
        "acid_auxiliary_st": g["acid_auxiliary_totalizer_st"].sum(),
        # SX feed (from Daily Report)
        "sx_feed_avg_flow_gpm": avg_nonzero(grp_dr["sx_feed_flow_gpm"]),
    }
    report_rows.append(row)

report = pd.DataFrame(report_rows)


# ── 4. WRITE EXCEL ───────────────────────────────────────────────────────────
out_path = Path(__file__).parent.parent / "docs" / "synthetic_physicals_master.xlsx"

with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
    nl.to_excel(writer, sheet_name="Nuton Load", index=False)
    dr.to_excel(writer, sheet_name="Daily Report", index=False)
    report.to_excel(writer, sheet_name="Report", index=False)

print(f"Written → {out_path}")
print(f"  Nuton Load:   {len(nl)} rows × {len(nl.columns)} cols")
print(f"  Daily Report: {len(dr)} rows × {len(dr.columns)} cols")
print(f"  Report:       {len(report)} rows × {len(report.columns)} cols")
