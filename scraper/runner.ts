import { chromium, Browser, BrowserContext } from 'playwright';
import {
  BookingWindow,
  RouteTarget,
  ScrapeTask,
  ScrapeResult,
  ScraperRunOptions,
  ScrapeBatchSummary,
  IScraperSource,
} from './core/types';
import { RobotsManager } from './core/robots';
import { DomainRateLimiter } from './core/rate-limiter';
import { SnapshotStorage } from './core/storage';
import { ScraperRegistry } from './sources/registry';
import { HONEST_USER_AGENT } from './core/user-agent';
import { ETLPipeline } from '../pipeline/cleaner/pipeline';
import { IndexComputationEngine } from '../pipeline/index-engine/engine';

const DEFAULT_ROUTES: RouteTarget[] = [
  { id: 'DEL-BOM', origin_code: 'DEL', destination_code: 'BOM', dgca_traffic_weight: 0.155, active: true },
  { id: 'BOM-DEL', origin_code: 'BOM', destination_code: 'DEL', dgca_traffic_weight: 0.145, active: true },
  { id: 'DEL-BLR', origin_code: 'DEL', destination_code: 'BLR', dgca_traffic_weight: 0.095, active: true },
  { id: 'BLR-DEL', origin_code: 'BLR', destination_code: 'DEL', dgca_traffic_weight: 0.090, active: true },
  { id: 'BOM-BLR', origin_code: 'BOM', destination_code: 'BLR', dgca_traffic_weight: 0.078, active: true },
  { id: 'BLR-BOM', origin_code: 'BLR', destination_code: 'BOM', dgca_traffic_weight: 0.075, active: true },
  { id: 'DEL-CCU', origin_code: 'DEL', destination_code: 'CCU', dgca_traffic_weight: 0.058, active: true },
  { id: 'CCU-DEL', origin_code: 'CCU', destination_code: 'DEL', dgca_traffic_weight: 0.055, active: true },
  { id: 'BLR-HYD', origin_code: 'BLR', destination_code: 'HYD', dgca_traffic_weight: 0.040, active: true },
  { id: 'MAA-DEL', origin_code: 'MAA', destination_code: 'DEL', dgca_traffic_weight: 0.034, active: true },
  { id: 'DEL-GAU', origin_code: 'DEL', destination_code: 'GAU', dgca_traffic_weight: 0.035, active: true },
  { id: 'BOM-GOI', origin_code: 'BOM', destination_code: 'GOI', dgca_traffic_weight: 0.032, active: true },
  { id: 'DEL-PAT', origin_code: 'DEL', destination_code: 'PAT', dgca_traffic_weight: 0.038, active: true },
  { id: 'BLR-COK', origin_code: 'BLR', destination_code: 'COK', dgca_traffic_weight: 0.028, active: true },
  { id: 'DEL-IXC', origin_code: 'DEL', destination_code: 'IXC', dgca_traffic_weight: 0.022, active: true },
  { id: 'BOM-PNQ', origin_code: 'BOM', destination_code: 'PNQ', dgca_traffic_weight: 0.020, active: true },
];

const WINDOW_DAYS: Record<BookingWindow, number> = {
  'T+1': 1,
  'T+7': 7,
  'T+15': 15,
  'T+30': 30,
  'T+45': 45,
};

export class ScraperRunner {
  private robots = RobotsManager.getInstance();
  private rateLimiter: DomainRateLimiter;
  private storage = new SnapshotStorage();
  private registry = ScraperRegistry.getInstance();

  constructor(options?: ScraperRunOptions) {
    this.rateLimiter = new DomainRateLimiter({
      minDelayMs: options?.minJitterMs ?? 3000,
      maxDelayMs: options?.maxJitterMs ?? 7000,
    });
  }

  /**
   * Helper to format YYYY-MM-DD for T+N days ahead from today in IST
   */
  private getTargetDate(daysAhead: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
  }

  /**
   * Builds matrix of tasks (Routes x Windows)
   */
  public buildTasks(routes: RouteTarget[], windows: BookingWindow[]): ScrapeTask[] {
    const tasks: ScrapeTask[] = [];
    for (const route of routes) {
      if (!route.active) continue;
      for (const win of windows) {
        const days = WINDOW_DAYS[win] || 7;
        tasks.push({
          route,
          booking_window: win,
          days_ahead: days,
          target_date: this.getTargetDate(days),
        });
      }
    }
    return tasks;
  }

  /**
   * Execute full scraping run with Playwright
   */
  public async runBatch(options: ScraperRunOptions = {}): Promise<ScrapeBatchSummary> {
    const startedAt = new Date().toISOString();
    const runId = `run_${Date.now()}`;
    const headless = options.headless !== false;

    // 1. Select routes (default to top 2 for initial verification or specified list)
    let targetRoutes = DEFAULT_ROUTES;
    if (options.routes && options.routes.length > 0 && options.routes[0] !== 'all') {
      const selected = options.routes.map((r) => r.toUpperCase());
      targetRoutes = DEFAULT_ROUTES.filter((r) => selected.includes(r.id));
      if (targetRoutes.length === 0) {
        targetRoutes = DEFAULT_ROUTES.slice(0, 2);
      }
    }

    // 2. Select booking windows
    const targetWindows: BookingWindow[] =
      options.windows && options.windows.length > 0
        ? options.windows
        : ['T+1', 'T+7', 'T+15', 'T+30', 'T+45'];

    // 3. Select sources
    let targetSources: IScraperSource[] = [];
    if (options.sources && options.sources.length > 0) {
      targetSources = options.sources
        .map((s) => this.registry.get(s))
        .filter((s): s is IScraperSource => Boolean(s));
    } else {
      // Default active sources: EaseMyTrip + Cleartrip + Akasa Air
      const easemytrip = this.registry.get('easemytrip');
      const cleartrip = this.registry.get('cleartrip');
      const akasa = this.registry.get('akasa');
      targetSources = [easemytrip, cleartrip, akasa].filter((s): s is IScraperSource => Boolean(s));
    }

    const tasks = this.buildTasks(targetRoutes, targetWindows);
    const totalRuns = tasks.length * targetSources.length;

    console.log(`\n======================================================================`);
    console.log(`  APIx REAL PLAYWRIGHT SCRAPING ENGINE (MoSPI SIH 2026 PS 26056)`);
    console.log(`  Run ID: ${runId}`);
    console.log(`  Routes: ${targetRoutes.map((r) => r.id).join(', ')} (${targetRoutes.length})`);
    console.log(`  Windows: ${targetWindows.join(', ')} (${targetWindows.length})`);
    console.log(`  Sources: ${targetSources.map((s) => s.name).join(', ')} (${targetSources.length})`);
    console.log(`  Total Tasks: ${totalRuns}`);
    console.log(`  Mode: HEADLESS CHROMIUM PLAYWRIGHT`);
    console.log(`======================================================================\n`);

    const results: ScrapeResult[] = [];
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      browser = await chromium.launch({
        headless: headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      });
      context = await browser.newContext({
        userAgent: HONEST_USER_AGENT,
        viewport: { width: 1366, height: 768 },
      });
    } catch (launchErr) {
      console.error(`Fatal: Failed to launch Chromium browser: ${(launchErr as Error).message}`);
      throw launchErr;
    }

    let completedCount = 0;

    try {
      // Iterate sources and tasks
      for (const source of targetSources) {
        // Step A: Check and respect robots.txt
        const robotsCheck = await this.robots.isAllowed(source.baseUrl);
        if (!robotsCheck.allowed) {
          console.warn(
            `\n⚠️ [ROBOTS.TXT DISALLOWED] Domain ${source.domain} disallowed: ${robotsCheck.reason}. Skipping source.`
          );
          for (const task of tasks) {
            results.push({
              task,
              source: source.name,
              success: false,
              quotes: [],
              raw_payload: { robots_reason: robotsCheck.reason },
              scraped_at: new Date().toISOString(),
              duration_ms: 0,
              error: {
                type: 'ROBOTS_DISALLOWED',
                message: robotsCheck.reason || 'Disallowed by robots.txt',
              },
            });
            completedCount++;
          }
          continue;
        }

        console.log(`\n[Robots.txt ✓] ${source.domain} verified compliant for User-Agent: APIx-PriceIndex-Bot`);

        for (const task of tasks) {
          completedCount++;
          const prefix = `[${completedCount}/${totalRuns}] [${source.name}] ${task.route.id} (${task.booking_window} · ${task.target_date})`;

          // Step B: Domain Rate-Limiting Jitter Delay (3-7 seconds)
          const waitTime = await this.rateLimiter.throttle(source.domain, robotsCheck.crawlDelay);
          if (waitTime > 0) {
            console.log(`   ⏳ Jitter delay: ${(waitTime / 1000).toFixed(2)}s for domain rate limit...`);
          }

          // Step C: Scrape attempt with isolated error handling
          try {
            console.log(`${prefix} -> navigating & extracting real fares...`);
            const result = await source.scrape(task, context);

            if (result.success && result.quotes.length > 0) {
              console.log(
                `   ✓ SUCCESS: Captured ${result.quotes.length} real flight quotes in ${(result.duration_ms / 1000).toFixed(1)}s (Method: ${result.intercepted_api ? 'JSON XHR' : 'DOM Extraction'})`
              );
            } else if (result.success && result.quotes.length === 0) {
              console.log(`   ℹ️ INFO: Scrape completed but 0 flights found for this window.`);
            } else {
              console.warn(
                `   ⚠️ WARNING: Scrape failed (${result.error?.type}): ${result.error?.message}`
              );
            }

            results.push(result);
            await this.storage.saveSnapshot(result);
          } catch (taskErr) {
            const err = taskErr as Error;
            console.error(`   ✗ ERROR on task: ${err.message}`);
            const failedResult: ScrapeResult = {
              task,
              source: source.name,
              success: false,
              quotes: [],
              raw_payload: { error: err.message },
              scraped_at: new Date().toISOString(),
              duration_ms: 0,
              error: {
                type: 'UNKNOWN',
                message: err.message,
              },
            };
            results.push(failedResult);
            await this.storage.saveSnapshot(failedResult);
          }
        }
      }
    } finally {
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }

    const finishedAt = new Date().toISOString();
    const successful = results.filter((r) => r.success && r.quotes.length > 0).length;
    const failed = results.filter((r) => !r.success).length;
    const totalQuotes = results.reduce((acc, r) => acc + r.quotes.length, 0);
    const durations = results.map((r) => r.duration_ms).sort((a, b) => a - b);
    const medianDuration = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : 0;

    const summary: ScrapeBatchSummary = {
      run_id: runId,
      started_at: startedAt,
      finished_at: finishedAt,
      total_tasks: totalRuns,
      successful_scrapes: successful,
      failed_scrapes: failed,
      skipped_robots: results.filter((r) => r.error?.type === 'ROBOTS_DISALLOWED').length,
      skipped_captcha: results.filter((r) => r.error?.type === 'CAPTCHA_DETECTED').length,
      total_quotes_collected: totalQuotes,
      median_duration_ms: medianDuration,
      results,
    };

    await this.storage.saveBatchSummary(summary);

    console.log(`\n======================================================================`);
    console.log(`  SCRAPING BATCH COMPLETE`);
    console.log(`  Successful Task Runs: ${successful}/${totalRuns}`);
    console.log(`  Total Real Flight Quotes Captured: ${totalQuotes}`);
    console.log(`  Median Task Latency: ${(medianDuration / 1000).toFixed(2)}s`);
    console.log(`  Raw Snapshots Stored: data/snapshots/${new Date().toISOString().split('T')[0]}/`);
    console.log(`======================================================================\n`);

    // Step D: Automatically run the Cleaning ETL pipeline on newly scraped snapshots
    console.log(`[Auto-Trigger] Launching Data Cleaning ETL Pipeline on raw snapshots...`);
    try {
      const etlPipeline = new ETLPipeline();
      const etlSummary = await etlPipeline.executePipeline({ date: 'latest' });

      if (etlSummary.records_inserted > 0) {
        console.log(`[Auto-Trigger] Launching Laspeyres Index Engine calculation...`);
        const indexEngine = new IndexComputationEngine();
        await indexEngine.computeIndex({ date: 'latest' });
      }
    } catch (pipelineErr) {
      console.warn(`[Auto-Trigger Warning] Pipeline execution note: ${(pipelineErr as Error).message}`);
    }

    return summary;
  }
}
