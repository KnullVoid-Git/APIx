import * as fs from 'fs';
import * as path from 'path';
import { CleanedFareRecord, ETLRunSummary } from './types';

export class CleanedFareStorage {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), 'data', 'cleaned');
  }

  /**
   * Persists cleaned fare records to JSON and CSV formats
   */
  public async saveCleanedRecords(
    records: CleanedFareRecord[],
    summary: ETLRunSummary,
    targetDate?: string
  ): Promise<{ jsonPath: string; csvPath: string }> {
    const dateFolder = targetDate || (records[0]?.scraped_at ? records[0].scraped_at.split('T')[0] : new Date().toISOString().split('T')[0]);
    const targetDir = path.join(this.baseDir, dateFolder);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const timestamp = Date.now();
    const jsonPath = path.join(targetDir, `cleaned_fares_${timestamp}.json`);
    const csvPath = path.join(targetDir, `cleaned_fares_${timestamp}.csv`);
    const summaryPath = path.join(targetDir, `etl_summary_${timestamp}.json`);

    // 1. Write JSON file
    await fs.promises.writeFile(
      jsonPath,
      JSON.stringify(
        {
          run_id: summary.run_id,
          executed_at: summary.executed_at,
          total_records: records.length,
          outliers_count: summary.outliers_flagged,
          records,
        },
        null,
        2
      ),
      'utf-8'
    );

    // 2. Write CSV file
    const headers = [
      'id',
      'route_id',
      'source',
      'carrier',
      'flight_number',
      'flight_date',
      'booking_window',
      'base_fare',
      'taxes',
      'total_fare',
      'scraped_at',
      'is_outlier',
      'outlier_reason',
      'departure_time',
      'is_nonstop',
    ];

    const rows = records.map((r) => [
      r.id,
      r.route_id,
      r.source,
      r.carrier,
      r.flight_number || '',
      r.flight_date,
      r.booking_window,
      r.base_fare,
      r.taxes,
      r.total_fare,
      r.scraped_at,
      r.is_outlier ? 'TRUE' : 'FALSE',
      `"${(r.outlier_reason || '').replace(/"/g, '""')}"`,
      r.departure_time || '',
      r.is_nonstop !== false ? 'TRUE' : 'FALSE',
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    await fs.promises.writeFile(csvPath, csvContent, 'utf-8');

    // 3. Write summary file
    await fs.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

    return { jsonPath, csvPath };
  }
}
