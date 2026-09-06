export type BookingWindow = 'T+1' | 'T+7' | 'T+15' | 'T+30' | 'T+45';
export type IndexFrequency = 'daily' | 'weekly' | 'monthly';
export type FareClass = 'Economy' | 'Premium Economy' | 'Business';

export interface Route {
  id: string;
  origin_code: string;
  origin_city: string;
  destination_code: string;
  destination_city: string;
  dgca_traffic_weight: number; // e.g. 0.185 (18.5% of national passenger traffic)
  active: boolean;
  distance_km?: number;
  daily_flights_avg?: number;
}

export interface RawSnapshot {
  id: string;
  route_id: string;
  source: 'IndiGo' | 'AirIndia' | 'SpiceJet' | 'MakeMyTrip' | 'EaseMyTrip' | 'Akasa' | 'Cleartrip';
  booking_window: BookingWindow;
  scraped_at: string;
  raw_payload: Record<string, unknown>;
}

export interface FareRecord {
  id: string;
  route_id: string;
  source: string;
  carrier: string;
  flight_number?: string;
  departure_time?: string;
  flight_date: string;
  booking_window: BookingWindow;
  fare_class: FareClass;
  base_fare: number;
  taxes: number;
  total_fare: number;
  scraped_at: string;
  is_outlier: boolean;
}

export interface DailyIndex {
  id: string;
  index_date: string;
  frequency: IndexFrequency;
  apix_value: number; // e.g. 104.82 (Normalized to Base Period 100.00)
  base_period_value: number; // 100.00
  delta_24h: number; // Percentage change compared to previous full basket day (+1.42%)
  delta_7d?: number;
  delta_30d?: number;
  median_basket_fare: number;
  weighted_basket_fare: number;
  active_routes_count: number;
  records_processed: number;
  methodology_notes: string;
  partial_basket?: boolean;
  last_full_basket_delta_24h?: number;
  last_full_basket_date?: string;
  distinct_dates_count?: number;
  collected_dates?: string[];
}

export interface DGCAReferenceFare {
  id: string;
  route_id: string;
  month: string; // YYYY-MM
  avg_fare: number;
  sample_size?: number;
}

export interface RouteIndexSummary {
  route: Route;
  representative_fare: number; // Median fare
  t1_fare: number;
  t7_fare: number;
  t15_fare: number;
  t30_fare: number;
  t45_fare: number;
  delta_24h: number;
  index_contribution: number; // Weight * route fare normalized
  carriers_sampled: string[];
  status: 'NORMAL' | 'SURGE' | 'EASED' | 'STABLE';
}
