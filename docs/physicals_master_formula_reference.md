# Physicals Master — Formula Reference for Data Entry App

This document captures the formula logic, data flow, and value ranges from the
`cu_nuton` pipeline. Use this as the spec when building the app that replaces
manual Excel data entry.

---

## 1. Data Flow Overview

```
Operator enters daily data
        │
        ▼
Bronze Delta tables (raw daily rows)
        │
        ▼
Silver gunnison_daily_report (formula mappings applied via AI → SQL)
        │
        ▼
Gold replicate_physicalmaster_actuals (daily → monthly aggregates)
        │
        ▼
Gold replicate_physicalmaster_report / report_long (dashboard)
```

---

## 2. Raw Input Fields (what operators type manually)

### 2a. Nuton Load Tab → `physicals_nuton_load` (bronze)
One row per day. Key manual input columns (col positions from Excel row 4):

**Stacking / Crushing (cols 8-30)**
| Column | Unit | Typical Range | Notes |
|---|---|---|---|
| `nuton_crushed_d_tons` | Tons | 0–5,000 | Day shift crushed |
| `crushed_n_tons` | Tons | 0–5,000 | Night shift crushed |
| `wet_total_crushed_tons` | Tons | 0–10,000 | Sum of D+N |
| `dry_crushed` | Tons | 0–9,000 | After moisture |
| `stacked_d_tons` | Tons | 0–5,000 | Day shift stacked |
| `stacked_n_tons` | Tons | 0–5,000 | Night shift stacked |
| `total_stacked_tons` | Tons | 0–10,000 | Sum of D+N |
| `grade_tcu` | % | 0.1–0.6 | TCu grade |
| `grade_ascu` | % | 0.05–0.4 | AsCu grade |
| `grade_cucn` | % | 0.001–0.05 | CuCN grade |
| `grade_cus` | % | 0.01–0.1 | CuSU grade |
| `acid_cons_lb_t` | lb/t | 5–30 | Acid consumption rate |

**Raffinate ROM (cols 42-57)**
| Column | Unit | Typical Range | Notes |
|---|---|---|---|
| `raffinate_rom_acid_cure_flow_gpm` | GPM | 0–500 | Acid cure flow |
| `rom_raffinate_flow_gpm` | GPM | 1,500–2,500 | Main raffinate flow |
| `cu_grade_g_l_2` | g/l | 0.01–0.5 | Cu grade |
| `acid_grade_g_l_1` | g/l | 1–10 | Acid grade BF |

**Raffinate Nuton (cols 58-68)**
| Column | Unit | Typical Range | Notes |
|---|---|---|---|
| `nuton_raffinate_pad_flow_gpm` | GPM | 500–2,000 | Pad flow |
| `cu_grade_g_l_3` | g/l | 0.01–0.4 | Cu grade |
| `acid_grade_g_l_2` | g/l | 1–8 | Acid grade |

**PLS Nuton (cols 69-81)**
| Column | Unit | Typical Range | Notes |
|---|---|---|---|
| `pls_pad5_nuton_pls_flow_gpm` | GPM | 500–2,000 | PLS flow |
| `pls_pad5_nuton_pls_grade_g_l` | g/l | 0.5–5 | Cu grade |
| `pls_pad5_nuton_pls_acid_g_l` | g/l | 0.1–2 | Acid H2SO4 |
| `pls_pad5_nuton_pls_acid_ph` | pH | 1–4 | pH |

**PLS ROM (cols 82-94)**
| Column | Unit | Typical Range | Notes |
|---|---|---|---|
| `pls_pad5_rom_pls_flow_gpm` | GPM | 1,000–3,000 | PLS flow |
| `pls_pad5_rom_pls_cu_grade_g_l` | g/l | 0.5–5 | Cu grade |
| `pls_pad5_rom_pls_acid_g_l` | g/l | 0.1–2 | Acid H2SO4 |
| `pls_pad5_rom_pls_acid_ph` | pH | 1–4 | pH |

**EW (cols 149-174)**
| Column | Unit | Typical Range | Notes |
|---|---|---|---|
| `rectifier_amps_cell_block_1_dc_amps` | Amps | 20,000–30,000 | Block 1 amps |
| `cell_block_2_dc_amps` | Amps | 20,000–30,000 | Block 2 amps |
| `cell_block_1_efficiency` | decimal | 0.85–0.98 | Efficiency |
| `cell_block_2_efficiency` | decimal | 0.85–0.98 | Efficiency |
| `total_cu_harvested_lb` | lb | 0–100,000 | Harvested Cu |

**Acid (cols 203-212)**
| Column | Unit | Typical Range | Notes |
|---|---|---|---|
| `acid_delivered_short_tons` | ST | 0–500 | Acid delivered |
| `acid_sx_usage_short_tons` | ST | 0–100 | SX acid usage |
| `rom_acid_cure_to_hlp_raff_totalizer_short_tons` | ST | 0–200 | ROM acid cure totalizer |
| `nuton_acid_to_hlp_raff_totalizer_short_tons` | ST | 0–200 | Nuton acid totalizer |
| `big_f_acid_totalizer_short_tons` | ST | 0–100 | Big-F acid totalizer |
| `acid_heap_leach_5_short_tons` | ST | 0–500 | Heap leach 5 total |
| `total_acid_consumed_short_tons` | ST | 0–600 | Total consumed |

**Mining (cols 39-41)**
| Column | Unit | Typical Range | Notes |
|---|---|---|---|
| `mining_tons_rom` | Tons | 0–50,000 | ROM ore mined |
| `mining_tons_non_core` | Tons | 0–30,000 | Non-core ore |
| `mining_tons_core` | Tons | 0–20,000 | Core ore |

### 2b. Daily Report Tab → `gunnison_daily_report` (silver via formula mapping)
53 columns. **All computed via AI-translated SQL formulas from the Nuton Load bronze table.**
Operators do NOT directly enter values here — it's auto-populated from Nuton Load.

Key computed columns (formula type → source):
- `ore_delivered_rom_tons` — `direct` → `mining_tons_rom`
- `ore_delivered_non_core_tons` — `direct` → `mining_tons_non_core`
- `ore_delivered_nuton_wet_total_crushed_tons` — `direct` → `wet_total_crushed_tons`
- `ore_delivered_nuton_total_stacked_pre_agglomerator_tons` — `direct` → `total_stacked_tons`
- `raffinate_rom_flow_gpm` — `direct` → `rom_raffinate_flow_gpm`
- `raffinate_rom_cu_grade_g_l` — `direct` → `cu_grade_g_l_2`
- `pls_rom_flow_gpm` — `direct` → `pls_pad5_rom_pls_flow_gpm`
- `pls_nuton_flow_gpm` — `direct` → `pls_pad5_nuton_pls_flow_gpm`
- `sx_flow_gpm` — `cross_ref` → derived from multiple raffinate/PLS columns
- `ew_cathode_harvest_lb` — `direct` → `total_cu_harvested_lb`
- `acid_consumed_st` — `mixed` → combination of acid totalizer columns

---

## 3. Monthly Aggregation Logic

Source: `gold_load_replicate_physicalmaster_actuals.ipynb`

All daily rows grouped by `last_day(report_date)` → one row per month.

### Aggregation Rules

| Metric Type | PySpark Function | Excel Equivalent | When to Use |
|---|---|---|---|
| Tonnage totals | `F.sum()` | `SUMIFS` | Crushed, stacked, acid tons |
| Flow rates | `avg_nonzero(col)` | `AVERAGEIF(col,">0")` | Raffinate GPM, PLS GPM — 0=offline |
| Grade (flow-weighted) | `flow_weighted_avg(grade, flow)` | `SUMPRODUCT(grade*flow)/SUM(flow)` | Cu grade, acid grade |
| EOM inventory | `F.last(col, ignorenulls=True)` | Last non-null in month | Cathode inventory, scrap inventory |
| Mine stats | `F.sum()` | `SUMIFS` | ROM, NonCore, Core tons |

### Key Aggregations

**Stacking (monthly):**
```python
F.sum("wet_total_crushed_tons")           → total_crushed_tons
F.sum("total_stacked_tons")               → total_stacked_tons
F.sum("ton_tcu")                          → ton_tcu  (grade × stacked tons daily product)
flow_weighted_avg("grade_tcu", "total_stacked_tons") → grade_tcu
```

**Raffinate ROM (monthly):**
```python
avg_nonzero("rom_raffinate_flow_gpm")     → rom_raffinate_flow_gpm
flow_weighted_avg("cu_grade_g_l_2", "rom_raffinate_flow_gpm") → cu_grade_g_l_2
F.sum("total_acid_pounds_lb_1") / 2000    → raff_rom_acid_mass_st
F.sum("total_cu_pounds_lbs_1")            → raff_rom_total_cu_lbs
```

**Raffinate Nuton (monthly):**
```python
avg_nonzero("nuton_raffinate_pad_flow_gpm")
flow_weighted_avg("cu_grade_g_l_3", "nuton_raffinate_pad_flow_gpm")
F.sum("nuton_acid_to_hlp_raff_totalizer_short_tons") → raff_nuton_totalizer_st
```

**PLS (monthly):**
```python
avg_nonzero("pls_pad5_nuton_pls_flow_gpm")
flow_weighted_avg("pls_pad5_nuton_pls_grade_g_l", "pls_pad5_nuton_pls_flow_gpm")
F.sum("pls_pad5_nuton_pls_total_net_cu_pounds_lb")
```

**EW (monthly):**
```python
avg_nonzero("rectifier_amps_cell_block_1_dc_amps")
avg_nonzero("cell_block_1_efficiency")
F.sum("total_cu_harvested_lb")
last_eom("grade_1_cathode_inventory_lb")   # EOM snapshot
last_eom("grade_2_cathode_inventory_lb")
```

**Acid (monthly):**
```python
F.sum("total_acid_consumed_short_tons")
F.sum("acid_sx_usage_short_tons")
F.sum("acid_delivered_short_tons")
F.sum("big_f_acid_totalizer_short_tons")
```

**ROM Load sub-areas (from `physicals_rom_load`, grouped by `irrigation_date`):**
```python
# Bolsa (rock_types = 'BQ')
F.sum("ore_st")                           → rom_bolsa_ore_st
F.sum("bolsa_ascu_lbs") / 2000            → rom_bolsa_ascu_st

# Lower Abrigo (rock_types = 'LA')
F.sum("ore_st")                           → rom_la_ore_st
F.sum("la_ascu_lbs") / 2000              → rom_la_ascu_st
```

---

## 4. Delta Table Write Targets

| Data | Bronze Table | Silver Table | Gold Table |
|---|---|---|---|
| Nuton Load daily input | `physicals_nuton_load` | — | — |
| Daily Report (computed) | `gunnison_daily_report` (bronze raw) | `gunnison_daily_report` | — |
| Formula mapping | — | `physicals_nuton_load_formula_mapping` | — |
| Monthly actuals | — | — | `replicate_physicalmaster_actuals` |
| Full report (wide) | — | — | `replicate_physicalmaster_report` |
| Dashboard long | — | — | `replicate_physicalmaster_report_long` |

---

## 5. Formula Classification (from formula_mapping notebook)

The AI formula translator classifies each Daily Report column:

| Type | Meaning | Translation |
|---|---|---|
| `direct` | References only Nuton Load (YTD) columns | Pass 1 — translate directly |
| `cross_ref` | References other Daily Report columns only | Pass 2 — needs Pass 1 SQL as context |
| `mixed` | References both Nuton Load + Daily Report cols | Pass 1 (with cross-ref context) |
| `unknown` | No YTD refs, no DR refs | Manual review needed |
| `none` | Not a formula — just a direct column copy | Alias the bronze column directly |

---

## 6. App Architecture Implications

Based on the above:

1. **Input screen** — operator enters Nuton Load columns (Section 2a) once per day
2. **Auto-compute layer** — app applies formula mappings (Section 3) to produce Daily Report equivalents
3. **No need for Daily Report input screen** — it's fully derived from Nuton Load
4. **Monthly view** — app aggregates daily entries using rules in Section 3
5. **Write path**:
   - Raw input → `physicals_nuton_load` (bronze, append)
   - Computed daily → `gunnison_daily_report` (silver, merge on date)
   - Monthly aggregates → trigger gold pipeline or compute in app

### Columns the app does NOT need to expose to operators:
- All `Flow*Grade` product columns (pre-multiplied, computed)
- All `YTD` accumulation columns (running totals)
- All `Cum` prefix columns (cumulative sums)
- Inventory columns — last value of month, not daily input
