import * as fs from 'fs';
import * as path from 'path';
import { DailyIndexRecord, RouteElasticityData } from './types';

export class IndexStorage {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), 'data', 'index');
  }

  /**
   * Persists daily index, elasticity dataset, and time-series rollups
   */
  public async saveIndexRun(
    dailyIndex: DailyIndexRecord,
    elasticity: RouteElasticityData[],
    weeklyIndex?: DailyIndexRecord,
    monthlyIndex?: DailyIndexRecord
  ): Promise<{
    daily_index_json: string;
    elasticity_json: string;
    time_series_csv: string;
  }> {
    const dailyDir = path.join(this.baseDir, 'daily');
    const elasticityDir = path.join(this.baseDir, 'elasticity');

    if (!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, { recursive: true });
    if (!fs.existsSync(elasticityDir)) fs.mkdirSync(elasticityDir, { recursive: true });

    const dateStr = dailyIndex.index_date;
    const dailyJsonPath = path.join(dailyDir, `daily_index_${dateStr}.json`);
    const elasticityJsonPath = path.join(elasticityDir, `elasticity_${dateStr}.json`);
    const latestJsonPath = path.join(this.baseDir, 'latest_index.json');
    const timeSeriesCsvPath = path.join(this.baseDir, 'time_series.csv');

    // 1. Write Daily Index JSON
    await fs.promises.writeFile(dailyJsonPath, JSON.stringify(dailyIndex, null, 2), 'utf-8');

    // 2. Write Latest Index Snapshot (for UI fast-load)
    await fs.promises.writeFile(
      latestJsonPath,
      JSON.stringify(
        {
          updated_at: new Date().toISOString(),
          current_index: dailyIndex,
          weekly_rollup: weeklyIndex,
          monthly_rollup: monthlyIndex,
          elasticity,
        },
        null,
        2
      ),
      'utf-8'
    );

    // 3. Write Elasticity JSON
    await fs.promises.writeFile(
      elasticityJsonPath,
      JSON.stringify({ date: dateStr, routes: elasticity }, null, 2),
      'utf-8'
    );

    // 4. Append to / update time_series.csv
    await this.updateTimeSeriesCsv(timeSeriesCsvPath, dailyIndex);

    return {
      daily_index_json: dailyJsonPath,
      elasticity_json: elasticityJsonPath,
      time_series_csv: timeSeriesCsvPath,
    };
  }

  private async updateTimeSeriesCsv(csvPath: string, index: DailyIndexRecord) {
    const header = 'index_date,frequency,apix_value,base_period_value,raw_weighted_fare,delta_24h,records_sampled,outliers_excluded,active_routes_count,partial_basket\n';
    const row = `${index.index_date},${index.frequency},${index.apix_value},${index.base_period_value},${index.raw_weighted_fare},${index.delta_24h || 0},${index.total_records_processed},${index.outliers_excluded_count},${index.active_routes_count},${index.partial_basket ? 'true' : 'false'}`;

    const dateMap = new Map<string, string>();

    if (fs.existsSync(csvPath)) {
      const existing = fs.readFileSync(csvPath, 'utf-8');
      const lines = existing.trim().split('\n').slice(1);
      for (const line of lines) {
        const parts = line.split(',');
        if (parts[0]) {
          dateMap.set(parts[0], line);
        }
      }
    }

    // Upsert today's record
    dateMap.set(index.index_date, row);

    // Sort by date ascending
    const sortedDates = Array.from(dateMap.keys()).sort();
    const outputRows = sortedDates.map((d) => dateMap.get(d)!);

    await fs.promises.writeFile(csvPath, header + outputRows.join('\n') + '\n', 'utf-8');
  }
}
