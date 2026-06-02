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
  cell_start_date: string;
  cell_end_date: string;
  status: "Complete" | "In Progress" | "Not Started";
  pct_complete: number | null;
  delay_days: number | null;
}

export type StackingMap = Record<string, Record<number, StackingRow>>;

export interface OreFeedPoint {
  ts: string;
  rate_thr: number;
  tons_interval: number;
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
