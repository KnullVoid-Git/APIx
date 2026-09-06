import * as fs from 'fs';
import * as path from 'path';
import { CleanedFareRecord } from '../cleaner/types';
import { RouteFareAggregation } from './types';
import { BookingWindow } from '../../types';

export const DGCA_ROUTE_WEIGHTS: Record<string, number> = {
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

// Empirical passenger booking-volume distribution across lead-time horizons
export const BOOKING_WINDOW_VOLUME_WEIGHTS: Record<BookingWindow, number> = {
  'T+1': 0.10,  // Last-minute / corporate emergency
  'T+7': 0.20,  // Short lead-time travel
  'T+15': 0.35, // Prime booking volume peak
  'T+30': 0.25, // Advance leisure
  'T+45': 0.10, // Ultra early anchor
};

const ALL_WINDOWS: BookingWindow[] = ['T+1', 'T+7', 'T+15', 'T+30', 'T+45'];

export class RouteAggregator {
  /**
   * Loads cleaned records from data/cleaned/ matching the target date
   */
  public loadCleanedRecords(dateOption?: string): CleanedFareRecord[] {
    const cleanedBase = path.join(process.cwd(), 'data', 'cleaned');
    if (!fs.existsSync(cleanedBase)) {
      return [];
    }

    const dateDirs = fs
      .readdirSync(cleanedBase)
      .filter((d) => fs.statSync(path.join(cleanedBase, d)).isDirectory());

    const targetDirs =
      dateOption && dateOption !== 'latest' && dateOption !== 'all'
        ? dateDirs.filter((d) => d === dateOption)
        : dateDirs.sort().reverse(); // latest first

    const allRecords: CleanedFareRecord[] = [];

    for (const dir of targetDirs) {
      const fullDir = path.join(cleanedBase, dir);
      const jsonFiles = fs
        .readdirSync(fullDir)
        .filter((f) => f.startsWith('cleaned_fares_') && f.endsWith('.json'))
        .sort()
        .reverse();

      // Fix: Use ONLY the latest cleaned file per date folder to prevent record inflation
      if (jsonFiles.length > 0) {
        const latestFile = jsonFiles[0];
        try {
          const content = fs.readFileSync(path.join(fullDir, latestFile), 'utf-8');
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.records)) {
            allRecords.push(...parsed.records);
          }
        } catch {
          // Ignore corrupt file
        }
      }

      if ((!dateOption || dateOption === 'latest') && allRecords.length > 0) break;
    }

    return allRecords;
  }

  /**
   * Aggregates records into per-route representative medians and weights
   */
  public aggregateByRoute(records: CleanedFareRecord[]): {
    routeAggregations: RouteFareAggregation[];
    totalOutliersExcluded: number;
    totalValidRecords: number;
  } {
    const routeMap = new Map<string, CleanedFareRecord[]>();
    let totalOutliersExcluded = 0;
    let totalValidRecords = 0;

    // Group by route
    for (const rec of records) {
      if (!routeMap.has(rec.route_id)) {
        routeMap.set(rec.route_id, []);
      }
      routeMap.get(rec.route_id)!.push(rec);
    }

    const routeAggregations: RouteFareAggregation[] = [];
    const allRouteIds = Object.keys(DGCA_ROUTE_WEIGHTS);

    for (const routeId of allRouteIds) {
      const routeRecords = routeMap.get(routeId) || [];
      const [originCode, destinationCode] = routeId.split('-');
      const weight = DGCA_ROUTE_WEIGHTS[routeId] || 0.05;

      const nonOutliers = routeRecords.filter((r) => !r.is_outlier);
      const outliers = routeRecords.filter((r) => r.is_outlier);
      totalOutliersExcluded += outliers.length;
      totalValidRecords += nonOutliers.length;

      const windowMedians: Record<BookingWindow, number> = {
        'T+1': 0,
        'T+7': 0,
        'T+15': 0,
        'T+30': 0,
        'T+45': 0,
      };
      const windowCounts: Record<BookingWindow, number> = {
        'T+1': 0,
        'T+7': 0,
        'T+15': 0,
        'T+30': 0,
        'T+45': 0,
      };

      const carriersSet = new Set<string>();

      if (routeRecords.length === 0) {
        routeAggregations.push({
          route_id: routeId,
          origin_code: originCode,
          destination_code: destinationCode,
          dgca_traffic_weight: weight,
          window_medians: windowMedians,
          window_counts: windowCounts,
          representative_daily_fare: 0,
          total_quotes_count: 0,
          outliers_excluded: 0,
          carriers: [],
          weighted_fare_contribution: 0,
        });
        continue;
      }
      for (const win of ALL_WINDOWS) {
        const winRecords = nonOutliers.filter((r) => r.booking_window === win);
        winRecords.forEach((r) => carriersSet.add(r.carrier));
        windowCounts[win] = winRecords.length;

        if (winRecords.length > 0) {
          const fares = winRecords.map((r) => r.total_fare).sort((a, b) => a - b);
          windowMedians[win] = fares[Math.floor(fares.length / 2)];
        } else {
          // If a specific window has no sample, mark 0 (no quotes) rather than fabricating a fallback fare
          windowMedians[win] = 0;
        }
      }

      // Representative route daily fare weighted by passenger booking lead-time shares of sampled windows
      let weightedSum = 0;
      let totalSampledWeight = 0;
      for (const win of ALL_WINDOWS) {
        if (windowMedians[win] > 0) {
          const winWeight = BOOKING_WINDOW_VOLUME_WEIGHTS[win] || 0.2;
          weightedSum += windowMedians[win] * winWeight;
          totalSampledWeight += winWeight;
        }
      }

      const representativeDailyFare = totalSampledWeight > 0 ? Math.round(weightedSum / totalSampledWeight) : 0;
      const weightedContribution = Number((representativeDailyFare * weight).toFixed(2));

      routeAggregations.push({
        route_id: routeId,
        origin_code: originCode,
        destination_code: destinationCode,
        dgca_traffic_weight: weight,
        window_medians: windowMedians,
        window_counts: windowCounts,
        representative_daily_fare: representativeDailyFare,
        total_quotes_count: routeRecords.length,
        outliers_excluded: outliers.length,
        carriers: Array.from(carriersSet).sort(),
        weighted_fare_contribution: weightedContribution,
      });
    }

    return {
      routeAggregations,
      totalOutliersExcluded,
      totalValidRecords,
    };
  }
}
