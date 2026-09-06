import { describe, it, expect } from 'vitest';
import { LaspeyresIndexCalculator, DEFAULT_BASE_PERIOD_BASKET_FARE } from '../pipeline/index-engine/laspeyres';
import { ElasticityCalculator } from '../pipeline/index-engine/elasticity';
import { RouteFareAggregation } from '../pipeline/index-engine/types';

describe('LaspeyresIndexCalculator', () => {
  const createRouteAgg = (
    routeId: string,
    weight: number,
    representativeFare: number,
    windowMedians: Record<string, number> = { 'T+1': 8000, 'T+7': 6500, 'T+15': 5500, 'T+30': 5000, 'T+45': 4500 }
  ): RouteFareAggregation => ({
    route_id: routeId,
    origin_code: routeId.split('-')[0],
    destination_code: routeId.split('-')[1],
    dgca_traffic_weight: weight,
    window_medians: windowMedians as any,
    window_counts: { 'T+1': 20, 'T+7': 25, 'T+15': 30, 'T+30': 30, 'T+45': 30 },
    representative_daily_fare: representativeFare,
    total_quotes_count: 135,
    outliers_excluded: 5,
    carriers: ['6E', 'AI'],
    weighted_fare_contribution: Number((representativeFare * weight).toFixed(2)),
  });

  it('normalizes to exactly 100.00 when weighted basket equals base basket reference fare', () => {
    const calc = new LaspeyresIndexCalculator(5280.0);
    // Two equal routes with fare = 5280 => weighted sum = 5280
    const routes = [
      createRouteAgg('DEL-BOM', 0.5, 5280),
      createRouteAgg('BOM-DEL', 0.5, 5280),
    ];

    const result = calc.computeDailyIndex(routes, '2026-08-22');

    expect(result.raw_weighted_fare).toBe(5280.0);
    expect(result.base_weighted_fare).toBe(5280.0);
    expect(result.apix_value).toBe(100.0);
  });

  it('computes exact Laspeyres index for price surges (e.g. +25% inflation = 125.00)', () => {
    const baseFare = 5000.0;
    const calc = new LaspeyresIndexCalculator(baseFare);

    // 25% surge across all routes
    const routes = [
      createRouteAgg('DEL-BOM', 0.6, 6250), // 6250 * 0.6 = 3750
      createRouteAgg('BOM-DEL', 0.4, 6250), // 6250 * 0.4 = 2500
    ]; // sum = 6250

    const result = calc.computeDailyIndex(routes, '2026-08-22');

    expect(result.raw_weighted_fare).toBe(6250.0);
    expect(result.apix_value).toBe(125.0); // (6250 / 5000) * 100 = 125.00
  });

  it('computes 16-route basket with calibrated weights summing to 100.0%', () => {
    const calc = new LaspeyresIndexCalculator(DEFAULT_BASE_PERIOD_BASKET_FARE);

    const weights16: Record<string, number> = {
      'DEL-BOM': 0.155,
      'BOM-DEL': 0.145,
      'DEL-BLR': 0.095,
      'BLR-DEL': 0.090,
      'BOM-BLR': 0.078,
      'BLR-BOM': 0.075,
      'DEL-CCU': 0.058,
      'CCU-DEL': 0.055,
      'BLR-HYD': 0.040,
      'MAA-DEL': 0.034,
      'DEL-GAU': 0.035,
      'BOM-GOI': 0.032,
      'DEL-PAT': 0.038,
      'BLR-COK': 0.028,
      'DEL-IXC': 0.022,
      'BOM-PNQ': 0.020,
    };

    const sumWeights = Object.values(weights16).reduce((a, b) => a + b, 0);
    expect(Number(sumWeights.toFixed(4))).toBe(1.0);

    const routes = Object.entries(weights16).map(([routeId, weight]) =>
      createRouteAgg(routeId, weight, 6000)
    );

    const result = calc.computeDailyIndex(routes, '2026-08-22');

    expect(result.active_routes_count).toBe(16);
    expect(result.raw_weighted_fare).toBe(6000.0);
    // (6000 / 5280) * 100 = 113.64
    expect(result.apix_value).toBe(113.64);
  });

  it('calculates 24-hour delta vs previous day index for full basket', () => {
    const calc = new LaspeyresIndexCalculator(5000.0);
    const weights16: Record<string, number> = {
      'DEL-BOM': 0.155, 'BOM-DEL': 0.145, 'DEL-BLR': 0.095, 'BLR-DEL': 0.090,
      'BOM-BLR': 0.078, 'BLR-BOM': 0.075, 'DEL-CCU': 0.058, 'CCU-DEL': 0.055,
      'BLR-HYD': 0.040, 'MAA-DEL': 0.034, 'DEL-GAU': 0.035, 'BOM-GOI': 0.032,
      'DEL-PAT': 0.038, 'BLR-COK': 0.028, 'DEL-IXC': 0.022, 'BOM-PNQ': 0.020,
    };
    const routes = Object.entries(weights16).map(([routeId, weight]) =>
      createRouteAgg(routeId, weight, 5500)
    );
    const prevIndex = 100.0;

    const result = calc.computeDailyIndex(routes, '2026-08-22', prevIndex);

    expect(result.partial_basket).toBe(false);
    expect(result.apix_value).toBe(110.0);
    expect(result.delta_24h).toBe(10.0); // +10% 24h change
  });

  it('marks partial basket and suppresses headline delta when routes < 16', () => {
    const calc = new LaspeyresIndexCalculator(5000.0);
    const routes = [createRouteAgg('DEL-BOM', 1.0, 5500)]; // Only 1 route
    const prevIndex = 100.0;

    const result = calc.computeDailyIndex(routes, '2026-08-22', prevIndex);

    expect(result.partial_basket).toBe(true);
    expect(result.delta_24h).toBe(0);
  });
});

describe('ElasticityCalculator', () => {
  it('computes advance-purchase yield multipliers and escalation ratios', () => {
    const calc = new ElasticityCalculator();
    const routeAgg: RouteFareAggregation = {
      route_id: 'DEL-BOM',
      origin_code: 'DEL',
      destination_code: 'BOM',
      dgca_traffic_weight: 0.155,
      window_medians: {
        'T+45': 4000,
        'T+30': 4500,
        'T+15': 5200,
        'T+7': 6400,
        'T+1': 8000,
      },
      window_counts: {
        'T+45': 50,
        'T+30': 60,
        'T+15': 70,
        'T+7': 80,
        'T+1': 90,
      },
      representative_daily_fare: 5400,
      total_quotes_count: 350,
      outliers_excluded: 10,
      carriers: ['6E', 'AI'],
      weighted_fare_contribution: 837.0,
    };

    const results = calc.computeElasticity([routeAgg]);

    expect(results.length).toBe(1);
    const elasticity = results[0];

    expect(elasticity.route_id).toBe('DEL-BOM');
    expect(elasticity.t1_to_t45_ratio).toBe(2.0); // 8000 / 4000 = 2.0x last minute multiplier
    expect(elasticity.overall_elasticity_score).toBe(Number(((8000 - 4000) / 44).toFixed(2))); // ₹90.91 / day

    const t45Point = elasticity.curve.find((p) => p.booking_window === 'T+45');
    expect(t45Point?.price_multiplier_vs_t45).toBe(1.0);

    const t1Point = elasticity.curve.find((p) => p.booking_window === 'T+1');
    expect(t1Point?.price_multiplier_vs_t45).toBe(2.0);
    expect(t1Point?.discount_vs_t1).toBe(0.0);
  });

  it('preserves non-monotonic market pricing without artificial yield curve distortion', () => {
    const calc = new ElasticityCalculator();
    // Real market scenario: T+7 surge flight (₹9,000) higher than T+1 last-minute discount (₹7,500)
    const routeAgg: RouteFareAggregation = {
      route_id: 'DEL-BOM',
      origin_code: 'DEL',
      destination_code: 'BOM',
      dgca_traffic_weight: 0.155,
      window_medians: {
        'T+45': 4000,
        'T+30': 4500,
        'T+15': 5000,
        'T+7': 9000, // Surge
        'T+1': 7500, // Cheaper than T+7
      },
      window_counts: {
        'T+45': 20,
        'T+30': 20,
        'T+15': 20,
        'T+7': 20,
        'T+1': 20,
      },
      representative_daily_fare: 6000,
      total_quotes_count: 100,
      outliers_excluded: 0,
      carriers: ['6E'],
      weighted_fare_contribution: 930.0,
    };

    const results = calc.computeElasticity([routeAgg]);
    const t1 = results[0].curve.find((p) => p.booking_window === 'T+1');
    const t7 = results[0].curve.find((p) => p.booking_window === 'T+7');

    // Confirms T+1 and T+7 are untouched and report true raw market medians
    expect(t1?.median_fare).toBe(7500);
    expect(t7?.median_fare).toBe(9000);
  });
});
