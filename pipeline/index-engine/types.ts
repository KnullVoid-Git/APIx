import { BookingWindow, IndexFrequency } from '../../types';

export interface RouteFareAggregation {
  route_id: string;
  origin_code: string;
  destination_code: string;
  dgca_traffic_weight: number;
  window_medians: Record<BookingWindow, number>;
  window_counts: Record<BookingWindow, number>;
  representative_daily_fare: number;
  total_quotes_count: number;
  outliers_excluded: number;
  carriers: string[];
  weighted_fare_contribution: number;
}

export interface RouteElasticityPoint {
  booking_window: BookingWindow;
  days_ahead: number;
  median_fare: number;
  average_fare: number;
  sample_size: number;
  price_multiplier_vs_t45: number;
  discount_vs_t1: number;
}

export interface RouteElasticityData {
  route_id: string;
  origin: string;
  destination: string;
  curve: RouteElasticityPoint[];
  t1_to_t45_ratio: number;
  overall_elasticity_score: number; // Slope / escalation coefficient
}

export interface DailyIndexRecord {
  id: string;
  index_date: string; // YYYY-MM-DD
  frequency: IndexFrequency;
  apix_value: number; // e.g. 104.82
  base_period_value: number; // 100.00
  raw_weighted_fare: number; // In INR e.g. 5420.50
  base_weighted_fare: number; // Base period raw fare in INR e.g. 5171.20
  delta_24h?: number;
  delta_7d?: number;
  delta_30d?: number;
  active_routes_count: number;
  total_records_processed: number;
  outliers_excluded_count: number;
  methodology_notes: string;
  partial_basket?: boolean;
  last_full_basket_delta_24h?: number;
  last_full_basket_date?: string;
  route_breakdown: RouteFareAggregation[];
}

export interface IndexEngineOptions {
  date?: string; // YYYY-MM-DD or 'latest'
  baseBasketFare?: number; // In INR, default Jan 2026 base e.g. 5350 INR
  dryRun?: boolean;
  verbose?: boolean;
}

export interface IndexRunResult {
  run_id: string;
  calculated_at: string;
  daily_index: DailyIndexRecord;
  weekly_index?: DailyIndexRecord;
  monthly_index?: DailyIndexRecord;
  elasticity_dataset: RouteElasticityData[];
  output_files: {
    daily_index_json: string;
    elasticity_json: string;
    time_series_csv: string;
  };
}
