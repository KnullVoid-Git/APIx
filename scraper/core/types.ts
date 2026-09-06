export type BookingWindow = 'T+1' | 'T+7' | 'T+15' | 'T+30' | 'T+45';
export type FareClass = 'Economy' | 'Premium Economy' | 'Business';

export interface RouteTarget {
  id: string; // e.g. 'DEL-BOM'
  origin_code: string;
  destination_code: string;
  dgca_traffic_weight: number;
  active: boolean;
}

export interface ScrapeTask {
  route: RouteTarget;
  booking_window: BookingWindow;
  target_date: string; // YYYY-MM-DD
  days_ahead: number;
}

export interface RawFlightQuote {
  source: string;
  carrier: string; // e.g. '6E', 'AI', 'QP', 'UK', 'SG', 'IX'
  carrier_name?: string;
  flight_number?: string;
  departure_time?: string;
  arrival_time?: string;
  duration?: string;
  is_nonstop: boolean;
  base_fare: number;
  taxes: number;
  total_fare: number;
  fare_class?: FareClass;
  cabin_class?: string;
  seats_left?: number;
  raw_flight_payload?: Record<string, unknown>;
}

export interface ScrapeResult {
  task: ScrapeTask;
  source: string;
  success: boolean;
  quotes: RawFlightQuote[];
  raw_payload: Record<string, unknown>;
  scraped_at: string;
  duration_ms: number;
  http_status?: number;
  intercepted_api?: boolean;
  error?: {
    type: 'ROBOTS_DISALLOWED' | 'CAPTCHA_DETECTED' | 'TIMEOUT' | 'NETWORK_ERROR' | 'PARSE_ERROR' | 'UNKNOWN';
    message: string;
    stack?: string;
  };
}

export interface IScraperSource {
  readonly name: string;
  readonly domain: string;
  readonly baseUrl: string;
  scrape(task: ScrapeTask, browserContext: unknown): Promise<ScrapeResult>;
}

export interface ScraperRunOptions {
  routes?: string[]; // specific route codes like ['DEL-BOM', 'BLR-DEL'] or 'all'
  sources?: string[]; // ['indigo', 'easemytrip', 'makemytrip']
  windows?: BookingWindow[]; // ['T+1', 'T+7', ...]
  headless?: boolean;
  dryRun?: boolean;
  strict?: boolean;
  concurrency?: number;
  minJitterMs?: number;
  maxJitterMs?: number;
}

export interface ScrapeBatchSummary {
  run_id: string;
  started_at: string;
  finished_at: string;
  total_tasks: number;
  successful_scrapes: number;
  failed_scrapes: number;
  skipped_robots: number;
  skipped_captcha: number;
  total_quotes_collected: number;
  median_duration_ms: number;
  results: ScrapeResult[];
}
