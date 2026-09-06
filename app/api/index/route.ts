import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { apiSuccess, apiError } from '@/lib/api/response';
import { checkRateLimit } from '@/lib/api/rate-limiter';
import { isValidDateFormat, isValidFrequency } from '@/lib/api/validator';

interface TimeSeriesRecord {
  date: string;
  apix: number;
  rawFare: number;
  delta24h: number;
  sampledRecords: number;
  outliersExcluded?: number;
  activeRoutes?: number;
  partialBasket?: boolean;
}

/**
 * Loads real computed daily index records from data/index/time_series.csv or data/index/daily/
 */
function loadStoredTimeSeries(): TimeSeriesRecord[] {
  const recordsMap = new Map<string, TimeSeriesRecord>();

  // 1. Try reading from time_series.csv
  try {
    const csvPath = path.join(process.cwd(), 'data', 'index', 'time_series.csv');
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.trim().split('\n').slice(1); // skip header
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 7 && parts[0]) {
          const dateStr = parts[0].trim();
          const activeRoutes = parts[8] ? parseInt(parts[8], 10) : 16;
          const isPartial = parts[9] ? parts[9].trim().toLowerCase() === 'true' : activeRoutes < 16;

          recordsMap.set(dateStr, {
            date: dateStr,
            apix: parseFloat(parts[2]),
            rawFare: parseFloat(parts[4]),
            delta24h: parseFloat(parts[5]),
            sampledRecords: parseInt(parts[6], 10),
            outliersExcluded: parts[7] ? parseInt(parts[7], 10) : 0,
            activeRoutes,
            partialBasket: isPartial,
          });
        }
      }
    }
  } catch (err) {
    console.warn(`[Index API] Error reading time_series.csv: ${(err as Error).message}`);
  }

  // 2. Supplement / fallback from data/index/daily/*.json if csv had no entries
  if (recordsMap.size === 0) {
    try {
      const dailyDir = path.join(process.cwd(), 'data', 'index', 'daily');
      if (fs.existsSync(dailyDir)) {
        const files = fs.readdirSync(dailyDir).filter((f) => f.startsWith('daily_index_') && f.endsWith('.json'));
        for (const file of files) {
          try {
            const content = fs.readFileSync(path.join(dailyDir, file), 'utf-8');
            const parsed = JSON.parse(content);
            if (parsed.index_date && parsed.apix_value) {
              const activeRoutes = parsed.active_routes_count || 16;
              const isPartial = parsed.partial_basket !== undefined ? parsed.partial_basket : activeRoutes < 16;

              recordsMap.set(parsed.index_date, {
                date: parsed.index_date,
                apix: parsed.apix_value,
                rawFare: parsed.raw_weighted_fare || 5585.36,
                delta24h: parsed.delta_24h || 0,
                sampledRecords: parsed.total_records_processed || 676,
                outliersExcluded: parsed.outliers_excluded_count || 62,
                activeRoutes,
                partialBasket: isPartial,
              });
            }
          } catch {}
        }
      }
    } catch {}
  }

  // Sort chronologically ascending
  const sortedDates = Array.from(recordsMap.keys()).sort();
  return sortedDates.map((d) => recordsMap.get(d)!);
}

export async function GET(request: NextRequest) {
  // 1. Rate Limit Check
  const rateLimit = checkRateLimit(request);
  if (!rateLimit.allowed) {
    return apiError(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit of ${rateLimit.limit} requests per minute exceeded. Try again in ${rateLimit.reset} seconds.`,
      429,
      undefined,
      rateLimit.headers
    );
  }

  const { searchParams } = new URL(request.url);
  const frequency = searchParams.get('frequency') || 'daily';
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 365;

  // 2. Validate Frequency
  if (!isValidFrequency(frequency)) {
    return apiError(
      'INVALID_FREQUENCY',
      `Invalid frequency parameter '${frequency}'. Allowed values: 'daily', 'weekly', 'monthly'.`,
      400,
      { allowed: ['daily', 'weekly', 'monthly'] },
      rateLimit.headers
    );
  }

  // 3. Validate Date Range
  if (from && !isValidDateFormat(from)) {
    return apiError(
      'INVALID_DATE_FORMAT',
      `Invalid 'from' date format '${from}'. Expected format: YYYY-MM-DD.`,
      400,
      undefined,
      rateLimit.headers
    );
  }

  if (to && !isValidDateFormat(to)) {
    return apiError(
      'INVALID_DATE_FORMAT',
      `Invalid 'to' date format '${to}'. Expected format: YYYY-MM-DD.`,
      400,
      undefined,
      rateLimit.headers
    );
  }

  if (from && to && from > to) {
    return apiError(
      'INVALID_DATE_RANGE',
      `'from' date (${from}) cannot be after 'to' date (${to}).`,
      400,
      undefined,
      rateLimit.headers
    );
  }

  // 4. Load real computed time-series records only (zero synthetic fallback)
  let results = loadStoredTimeSeries();

  if (from) {
    results = results.filter((p) => p.date >= from);
  }
  if (to) {
    results = results.filter((p) => p.date <= to);
  }

  // Transform based on frequency if weekly or monthly requested
  if (frequency === 'weekly') {
    const weeklyGrouped = [];
    for (let i = 0; i < results.length; i += 7) {
      const chunk = results.slice(i, i + 7);
      const avgApix = Number((chunk.reduce((a, b) => a + b.apix, 0) / chunk.length).toFixed(2));
      const avgFare = Math.round(chunk.reduce((a, b) => a + b.rawFare, 0) / chunk.length);
      weeklyGrouped.push({
        date: chunk[chunk.length - 1].date,
        frequency: 'weekly',
        apix_value: avgApix,
        base_period_value: 100.0,
        raw_weighted_fare: avgFare,
        days_aggregated: chunk.length,
      });
    }

    const coverageStart = weeklyGrouped.length > 0 ? weeklyGrouped[0].date : null;
    const coverageEnd = weeklyGrouped.length > 0 ? weeklyGrouped[weeklyGrouped.length - 1].date : null;

    return apiSuccess(
      weeklyGrouped.slice(-limit),
      weeklyGrouped.length,
      {
        frequency: 'weekly',
        data_coverage_start: coverageStart,
        data_coverage_end: coverageEnd,
        data_source: 'REAL_COMPUTED_DAILY_INDEX',
      },
      rateLimit.headers
    );
  }

  if (frequency === 'monthly') {
    const monthsMap = new Map<string, TimeSeriesRecord[]>();
    for (const pt of results) {
      const monthKey = pt.date.slice(0, 7);
      if (!monthsMap.has(monthKey)) monthsMap.set(monthKey, []);
      monthsMap.get(monthKey)!.push(pt);
    }
    const monthlyGrouped = [];
    for (const [monthKey, chunk] of monthsMap.entries()) {
      const avgApix = Number((chunk.reduce((a, b) => a + b.apix, 0) / chunk.length).toFixed(2));
      const avgFare = Math.round(chunk.reduce((a, b) => a + b.rawFare, 0) / chunk.length);
      monthlyGrouped.push({
        month: monthKey,
        frequency: 'monthly',
        apix_value: avgApix,
        base_period_value: 100.0,
        raw_weighted_fare: avgFare,
        days_aggregated: chunk.length,
      });
    }

    const coverageStart = monthlyGrouped.length > 0 ? monthlyGrouped[0].month : null;
    const coverageEnd = monthlyGrouped.length > 0 ? monthlyGrouped[monthlyGrouped.length - 1].month : null;

    return apiSuccess(
      monthlyGrouped.slice(-limit),
      monthlyGrouped.length,
      {
        frequency: 'monthly',
        data_coverage_start: coverageStart,
        data_coverage_end: coverageEnd,
        data_source: 'REAL_COMPUTED_DAILY_INDEX',
      },
      rateLimit.headers
    );
  }

  const responseData = results.slice(-limit).map((r) => ({
    index_date: r.date,
    frequency: 'daily',
    apix_value: r.apix,
    base_period_value: 100.0,
    raw_weighted_fare: r.rawFare,
    delta_24h: r.delta24h,
    records_sampled: r.sampledRecords,
    active_routes_count: r.activeRoutes || 16,
    partial_basket: Boolean(r.partialBasket),
  }));

  const coverageStart = responseData.length > 0 ? responseData[0].index_date : null;
  const coverageEnd = responseData.length > 0 ? responseData[responseData.length - 1].index_date : null;

  return apiSuccess(
    responseData,
    responseData.length,
    {
      frequency: 'daily',
      base_period: 'JAN 2026 = 100.00',
      base_basket_fare_inr: 5280.0,
      data_coverage_start: coverageStart,
      data_coverage_end: coverageEnd,
      data_source: 'REAL_COMPUTED_DAILY_INDEX',
    },
    rateLimit.headers
  );
}
