import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { apiSuccess, apiError } from '@/lib/api/response';

const DGCA_ROUTE_WEIGHTS: Record<string, number> = {
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

function getDistinctDatesInfo(): { count: number; dates: string[] } {
  const datesSet = new Set<string>();

  // 1. Try reading from time_series.csv
  try {
    const csvPath = path.join(process.cwd(), 'data', 'index', 'time_series.csv');
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.trim().split('\n').slice(1);
      for (const line of lines) {
        const parts = line.split(',');
        if (parts[0]) {
          const d = parts[0].trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            datesSet.add(d);
          }
        }
      }
    }
  } catch {}

  // 2. Supplement from daily directory
  try {
    const dailyDir = path.join(process.cwd(), 'data', 'index', 'daily');
    if (fs.existsSync(dailyDir)) {
      const files = fs.readdirSync(dailyDir).filter((f) => f.startsWith('daily_index_') && f.endsWith('.json'));
      for (const f of files) {
        const match = f.match(/daily_index_(\d{4}-\d{2}-\d{2})\.json/);
        if (match) datesSet.add(match[1]);
      }
    }
  } catch {}

  const sortedDates = Array.from(datesSet).sort();
  return {
    count: Math.max(1, sortedDates.length),
    dates: sortedDates,
  };
}

function getLatestFullBasketInfo(): { last_full_basket_delta_24h?: number; last_full_basket_date?: string } {
  try {
    const csvPath = path.join(process.cwd(), 'data', 'index', 'time_series.csv');
    if (fs.existsSync(csvPath)) {
      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.trim().split('\n').slice(1);
      for (let i = lines.length - 1; i >= 0; i--) {
        const parts = lines[i].split(',');
        if (parts.length >= 7) {
          const activeRoutes = parts[8] ? parseInt(parts[8], 10) : 16;
          const isPartial = parts[9] ? parts[9].trim().toLowerCase() === 'true' : activeRoutes < 16;
          if (!isPartial && activeRoutes === 16) {
            return {
              last_full_basket_delta_24h: parseFloat(parts[5]) || 0,
              last_full_basket_date: parts[0].trim(),
            };
          }
        }
      }
    }
  } catch {}
  return {};
}

export async function GET(request: NextRequest) {
  try {
    const datesInfo = getDistinctDatesInfo();
    const fullBasketInfo = getLatestFullBasketInfo();

    // 1. Try reading latest_index.json
    try {
      const latestIndexPath = path.join(process.cwd(), 'data', 'index', 'latest_index.json');
      if (fs.existsSync(latestIndexPath)) {
        const fileContent = fs.readFileSync(latestIndexPath, 'utf-8');
        const parsedData = JSON.parse(fileContent);
        
        if (parsedData.current_index) {
          parsedData.current_index.distinct_dates_count = datesInfo.count;
          parsedData.current_index.collected_dates = datesInfo.dates;
          if (parsedData.current_index.active_routes_count === undefined) {
            parsedData.current_index.active_routes_count = parsedData.current_index.route_breakdown?.filter((r: any) => r.representative_daily_fare > 0).length || 16;
          }
          parsedData.current_index.partial_basket = parsedData.current_index.active_routes_count < 16;
          parsedData.current_index.last_full_basket_delta_24h = fullBasketInfo.last_full_basket_delta_24h;
          parsedData.current_index.last_full_basket_date = fullBasketInfo.last_full_basket_date;
        }

        return apiSuccess(parsedData, 1, {
          source: 'LOCAL_INDEX_FILE',
          distinct_dates_count: datesInfo.count,
          collected_dates: datesInfo.dates,
          last_full_basket_delta_24h: fullBasketInfo.last_full_basket_delta_24h,
          last_full_basket_date: fullBasketInfo.last_full_basket_date,
          computed_at: new Date().toISOString(),
        });
      }
    } catch {
      // Disk read failure
    }

    // 2. Try loading the newest file from data/index/daily/
    try {
      const dailyDir = path.join(process.cwd(), 'data', 'index', 'daily');
      if (fs.existsSync(dailyDir)) {
        const files = fs.readdirSync(dailyDir).filter((f) => f.startsWith('daily_index_') && f.endsWith('.json')).sort().reverse();
        if (files.length > 0) {
          const newestDaily = JSON.parse(fs.readFileSync(path.join(dailyDir, files[0]), 'utf-8'));
          const activeRoutes = newestDaily.active_routes_count || newestDaily.route_breakdown?.filter((r: any) => r.representative_daily_fare > 0).length || 16;
          return apiSuccess({
            updated_at: new Date().toISOString(),
            current_index: {
              ...newestDaily,
              active_routes_count: activeRoutes,
              partial_basket: activeRoutes < 16,
              last_full_basket_delta_24h: fullBasketInfo.last_full_basket_delta_24h,
              last_full_basket_date: fullBasketInfo.last_full_basket_date,
              distinct_dates_count: datesInfo.count,
              collected_dates: datesInfo.dates,
            },
            elasticity: [],
          }, 1, {
            source: 'DAILY_ARCHIVE_FILE',
            distinct_dates_count: datesInfo.count,
            collected_dates: datesInfo.dates,
            last_full_basket_delta_24h: fullBasketInfo.last_full_basket_delta_24h,
            last_full_basket_date: fullBasketInfo.last_full_basket_date,
            computed_at: new Date().toISOString(),
          });
        }
      }
    } catch {
      // Fallback to honest insufficient_data
    }

    // 3. Honest response when real scraped data is unavailable
    return apiSuccess({
      updated_at: new Date().toISOString(),
      status: 'insufficient_data',
      message: 'No real scraped flight quotes available for the current date. Waiting for daily automated pipeline execution.',
      current_index: null,
      elasticity: [],
    }, 0, {
      source: 'INSUFFICIENT_DATA',
      distinct_dates_count: datesInfo.count,
      collected_dates: datesInfo.dates,
      computed_at: new Date().toISOString(),
    });
  } catch (error) {
    return apiError('SERVER_ERROR', (error as Error).message, 500);
  }
}
