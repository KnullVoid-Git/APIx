import { RouteFareAggregation, DailyIndexRecord } from './types';

// Default Base Period Basket Fare (Jan 2026 Normalization Baseline = 100.00)
export const DEFAULT_BASE_PERIOD_BASKET_FARE = 5280.0;

export class LaspeyresIndexCalculator {
  private baseBasketFare: number;

  constructor(baseBasketFare?: number) {
    this.baseBasketFare = baseBasketFare ?? DEFAULT_BASE_PERIOD_BASKET_FARE;
  }

  /**
   * Computes the Laspeyres-style weighted APIx index
   */
  public computeDailyIndex(
    routeAggregations: RouteFareAggregation[],
    indexDate: string,
    previousDayIndex?: number
  ): DailyIndexRecord {
    let rawWeightedSum = 0;
    let totalSampledWeight = 0;
    let totalRecordsCount = 0;
    let totalOutliersCount = 0;

    const routeContributors: string[] = [];

    for (const route of routeAggregations) {
      if (route.representative_daily_fare > 0) {
        rawWeightedSum += route.representative_daily_fare * route.dgca_traffic_weight;
        totalSampledWeight += route.dgca_traffic_weight;
      }
      totalRecordsCount += route.total_quotes_count;
      totalOutliersCount += route.outliers_excluded;

      routeContributors.push(
        `${route.route_id} (w=${(route.dgca_traffic_weight * 100).toFixed(1)}%, P=₹${route.representative_daily_fare})`
      );
    }

    const normalizedBasketFare = totalSampledWeight > 0 ? Number((rawWeightedSum / totalSampledWeight).toFixed(2)) : 0;

    // Normalize against Base Period (Jan 2026 = 100.00)
    const apixValue = normalizedBasketFare > 0 ? Number(((normalizedBasketFare / this.baseBasketFare) * 100).toFixed(2)) : 0;

    const sampledCorridorsCount = routeAggregations.filter((r) => r.representative_daily_fare > 0).length;
    const isPartialBasket = sampledCorridorsCount < 16;

    // Calculate 24h Delta: ONLY against the previous FULL basket day
    let delta24h = 0;
    if (!isPartialBasket && previousDayIndex && previousDayIndex > 0) {
      delta24h = Number((((apixValue - previousDayIndex) / previousDayIndex) * 100).toFixed(2));
    }

    const methodologyNotes = [
      `Methodology: Laspeyres Weighted Basket Index (MoSPI CPI Transport Sub-Group Augmentation)`,
      `Base Period Value: 100.00 (Jan 2026 Reference Basket Fare = ₹${this.baseBasketFare.toFixed(2)})`,
      `Current 24h Weighted Basket Fare: ₹${normalizedBasketFare.toFixed(2)}`,
      `Active Corridors Sampled: ${sampledCorridorsCount}/${routeAggregations.length} DGCA routes${isPartialBasket ? ' [PARTIAL BASKET DIAGNOSTIC RUN]' : ' [FULL NATIONAL BASKET]'}`,
      `Total Flight Quotes Evaluated: ${totalRecordsCount} (${totalOutliersCount} outliers rejected via Tukey IQR)`,
      `Contributors: ${routeContributors.join('; ')}`,
    ].join(' | ');

    return {
      id: `daily_index_${indexDate}`,
      index_date: indexDate,
      frequency: 'daily',
      apix_value: apixValue,
      base_period_value: 100.0,
      raw_weighted_fare: normalizedBasketFare,
      base_weighted_fare: this.baseBasketFare,
      delta_24h: delta24h,
      active_routes_count: sampledCorridorsCount,
      partial_basket: isPartialBasket,
      total_records_processed: totalRecordsCount,
      outliers_excluded_count: totalOutliersCount,
      methodology_notes: methodologyNotes,
      route_breakdown: routeAggregations,
    };
  }
}
