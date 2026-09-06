import * as fs from 'fs';
import * as path from 'path';
import {
  RawSnapshotInput,
  CleanedFareRecord,
  CleanerOptions,
  ETLRunSummary,
} from './types';
import { SnapshotParser } from './parser';
import { FareDeduplicator } from './deduplicator';
import { OutlierDetector } from './outlier-detector';
import { CleanedFareStorage } from './fare-storage';

export class ETLPipeline {
  private parser = new SnapshotParser();
  private deduplicator = new FareDeduplicator();
  private outlierDetector: OutlierDetector;
  private storage = new CleanedFareStorage();

  constructor(options?: CleanerOptions) {
    this.outlierDetector = new OutlierDetector({
      multiplier: options?.outlierMultiplier ?? 1.5,
      minValidFare: options?.minValidFare ?? 500,
      maxValidFare: options?.maxValidFare ?? 75000,
    });
  }

  /**
   * Discovers snapshot files to clean based on options
  /**
   * Discovers all available date directories in data/snapshots
   */
  public getSnapshotDateDirs(): string[] {
    const snapshotsBase = path.join(process.cwd(), 'data', 'snapshots');
    if (!fs.existsSync(snapshotsBase)) return [];
    return fs
      .readdirSync(snapshotsBase)
      .filter((d) => fs.statSync(path.join(snapshotsBase, d)).isDirectory())
      .sort();
  }

  /**
   * Cleans a single date's raw snapshots strictly in isolation
   */
  public async cleanDate(targetDate: string, options: CleanerOptions = {}): Promise<ETLRunSummary> {
    const runId = `etl_${targetDate}_${Date.now()}`;
    const executedAt = new Date().toISOString();
    const snapshotsBase = path.join(process.cwd(), 'data', 'snapshots');
    const fullDir = path.join(snapshotsBase, targetDate);

    if (!fs.existsSync(fullDir)) {
      console.warn(`[ETL Ingestion] Directory not found: ${fullDir}`);
      return {
        run_id: runId,
        executed_at: executedAt,
        snapshots_processed: 0,
        total_raw_quotes_parsed: 0,
        duplicates_skipped: 0,
        invalid_fares_skipped: 0,
        valid_records_processed: 0,
        outliers_flagged: 0,
        records_inserted: 0,
        group_stats: [],
      };
    }

    const snapshotFiles = fs
      .readdirSync(fullDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(fullDir, f));

    console.log(`[ETL Ingestion: ${targetDate}] Discovered ${snapshotFiles.length} raw snapshot file(s).`);

    let rawQuotesParsed = 0;
    let invalidFaresSkipped = 0;
    const candidateRecords: CleanedFareRecord[] = [];

    // Stage 1 & 2: Ingestion & Parsing
    for (const filePath of snapshotFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const snapshot: RawSnapshotInput = JSON.parse(content);

        const parsed = this.parser.parseSnapshot(snapshot);
        rawQuotesParsed += (snapshot.quotes?.length || 1);

        for (const record of parsed) {
          // Filter out missing/invalid price data
          if (record.total_fare <= 0 || record.base_fare <= 0 || isNaN(record.total_fare)) {
            invalidFaresSkipped++;
            continue;
          }
          candidateRecords.push(record);
        }
      } catch (err) {
        console.warn(`[ETL Parser] Could not parse file ${path.basename(filePath)}: ${(err as Error).message}`);
      }
    }

    console.log(`[ETL Parser ✓] ${targetDate}: Extracted ${candidateRecords.length} candidate quotes (skipped ${invalidFaresSkipped} invalid).`);

    // Stage 3: Deduplication
    this.deduplicator.reset();
    const { unique, duplicatesCount } = this.deduplicator.deduplicate(candidateRecords);
    console.log(`[ETL Deduplication ✓] ${targetDate}: Dropped ${duplicatesCount} duplicates. ${unique.length} unique quotes retained.`);

    // Stage 4: Outlier Detection (Tukey IQR)
    const { taggedRecords, groupStats, totalOutliers } = this.outlierDetector.detectAndTagOutliers(unique);
    console.log(`[ETL Outliers ✓] ${targetDate}: Evaluated ${groupStats.length} partitions. Flagged ${totalOutliers} outlier(s).`);

    // Stage 5: Persistence strictly to that date's directory
    const summary: ETLRunSummary = {
      run_id: runId,
      executed_at: executedAt,
      snapshots_processed: snapshotFiles.length,
      total_raw_quotes_parsed: rawQuotesParsed,
      duplicates_skipped: duplicatesCount,
      invalid_fares_skipped: invalidFaresSkipped,
      valid_records_processed: unique.length,
      outliers_flagged: totalOutliers,
      records_inserted: taggedRecords.length,
      group_stats: groupStats,
    };

    if (!options.dryRun) {
      const { jsonPath, csvPath } = await this.storage.saveCleanedRecords(taggedRecords, summary, targetDate);
      summary.output_file = jsonPath;
      console.log(`[ETL Storage ✓] Saved cleaned records for ${targetDate} (${taggedRecords.length} records) to: ${path.relative(process.cwd(), jsonPath)}`);
    } else {
      console.log(`[ETL Storage] DRY-RUN enabled: skipped writing to disk/database.`);
    }

    return summary;
  }

  /**
   * Runs the full cleaning and normalization ETL pipeline (strictly isolated per date)
   */
  public async executePipeline(options: CleanerOptions = {}): Promise<ETLRunSummary> {
    const availableDates = this.getSnapshotDateDirs();
    if (availableDates.length === 0) {
      console.warn(`[ETL Ingestion] No raw snapshot directories found. Run 'npm run scrape' first.`);
      return {
        run_id: `etl_${Date.now()}`,
        executed_at: new Date().toISOString(),
        snapshots_processed: 0,
        total_raw_quotes_parsed: 0,
        duplicates_skipped: 0,
        invalid_fares_skipped: 0,
        valid_records_processed: 0,
        outliers_flagged: 0,
        records_inserted: 0,
        group_stats: [],
      };
    }

    let targetDates: string[] = [];
    if (options.date && options.date === 'all') {
      targetDates = availableDates;
    } else if (options.date && options.date !== 'latest') {
      targetDates = [options.date];
    } else {
      // Default: process latest date only (daily scheduled cron mode)
      targetDates = [availableDates[availableDates.length - 1]];
    }

    console.log(`\n======================================================================`);
    console.log(`  APIx DATA CLEANING & ETL PIPELINE (MoSPI PS 26056)`);
    console.log(`  Target Date(s): ${targetDates.join(', ')}`);
    console.log(`  IQR Outlier Multiplier: ${options.outlierMultiplier ?? 1.5}x`);
    console.log(`  Mode: Strictly isolated per-date extraction (no historical pooling)`);
    console.log(`======================================================================\n`);

    let lastSummary: ETLRunSummary = {} as ETLRunSummary;
    for (const d of targetDates) {
      lastSummary = await this.cleanDate(d, options);
    }

    return lastSummary;
  }
}
