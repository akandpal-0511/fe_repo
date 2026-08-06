export interface TagProfile {
  Id: number;
  PerformanceArea: string;
  Area: string;
  Container: string;
  Measure: string;
  Description: string;
  Unit: string | null;
  Tag: string;
  ValueType: string;
  Statistic: string;
  LowerLimit: number | null;
  UpperLimit: number | null;
  DataSource: string;
  IsCalculated: boolean;
}

export interface LatestValue {
  Tag: string;
  Value: number | null;
  Timestamp_AZ: string;
}

export interface TrendPoint {
  Tag: string;
  Timestamp_AZ: string;
  Value: number | null;
}

export interface KPICard {
  tag: string;
  description: string;
  value: number | null;
  formatted: string;
  statusColor: string;
  lo: number | null;
  hi: number | null;
  unit: string;
}

export interface PlotlyFigure {
  data: object[];
  layout: object;
  config?: object;
}

export interface SelectedTag {
  tag: string;
  desc: string;
}

export interface BioReactorPoint {
  Date: string;
  Container: string;
  Temperature: string;
  Volume: number | null;
  Measure: string;
  Value: number;
}

export interface BioReactorResponse {
  points: BioReactorPoint[];
  /** measure → temp_profile → [lo, hi] */
  limits: Record<string, Record<string, [number, number]>>;
}

export interface StackingRow {
  cell: string;
  panel: number;
  material: string;
  stacking_order: number;
  tons_planned: number | null;
  actual_tons: number | null;
  days_stacked_planned: number | null;
  current_rate_tpd: number | null;
  cell_start_date: string | null;
  cell_end_date: string | null;
  actual_start_ts: string | null;
  actual_end_ts: string | null;
  status: "Complete" | "In Progress" | "Not Started";
  pct_complete: number | null;
  delay_days: number | null;
}

export type StackingMap = Record<string, Record<number, StackingRow>>;

export interface OreFeedPoint {
  ts: string;
  rate_thr: number | null;
  tons_interval: number | null;
  tag: string;
}

export interface CellAllocationRow {
  panel: string;
  cell: string;
  material: string;
  tons_planned: number | null;
  tons_actual: number | null;
  days_planned: number | null;
  days_actual: number | null;
  start_date: string;
  end_date: string;
  status: string;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export interface CommentRow {
  id: number;
  performance_area: string;
  tag_name: string;
  week_range: string;
  comment_category: string;
  comment_text: string;
  created_at: string;
  created_by: string;
}

// ── Causality ──────────────────────────────────────────────────────────────────

export interface CausalityCell {
  corr: number;
  lag:  number;
}

export interface HeatmapResponse {
  areas:  string[];
  matrix: (CausalityCell | null)[][];
}

export interface CausalityNode {
  id:          string;
  tag:         string;
  description: string;
  pa:          string;
  colour:      string;
  degree:      number;
}

export interface CausalityEdge {
  source:             string;
  target:             string;
  corr:               number;
  lag:                number;
  direction:          "forward" | "inverse";
  granger_p?:         number | null;
  granger_confirmed?: boolean;
}

export interface NetworkResponse {
  nodes: CausalityNode[];
  edges: CausalityEdge[];
}

// ── Forecast ──────────────────────────────────────────────────────────────────

export interface ForecastPoint {
  t:    string;
  v:    number;
  lo95: number;
  hi95: number;
}

export interface HistoryPoint {
  t: string;
  v: number;
}

export interface BreachEta {
  hours:            number | null;
  direction:        "high" | "low" | null;
  projected_value:  number | null;
  warning_level:    "ok" | "warn" | "alarm";
}

export interface ForecastResponse {
  tag:           string;
  description:   string;
  unit:          string;
  lo:            number | null;
  hi:            number | null;
  model_used:    "holt" | "prophet" | "lgbm" | null;
  model_scores:  Record<string, number>;
  history:       HistoryPoint[];
  forecast:      ForecastPoint[];
  breach:        BreachEta;
  error:         string | null;
}

export interface EarlyWarningSensor {
  tag:         string;
  description: string;
  pa:          string;
  colour:      string;
  lag_hours:   number;
  corr:        number;
  direction:   "positive" | "inverse";
}
