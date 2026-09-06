import { ScraperRunner } from './runner';
import { BookingWindow, ScraperRunOptions } from './core/types';

function parseArgs(): ScraperRunOptions {
  const args = process.argv.slice(2);
  const options: ScraperRunOptions = {
    headless: true,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--routes' && args[i + 1]) {
      options.routes = args[i + 1].split(',').map((r) => r.trim());
      i++;
    } else if (arg === '--sources' && args[i + 1]) {
      options.sources = args[i + 1].split(',').map((s) => s.trim());
      i++;
    } else if (arg === '--windows' && args[i + 1]) {
      options.windows = args[i + 1].split(',').map((w) => w.trim()) as BookingWindow[];
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--no-headless' || arg === '--head') {
      options.headless = false;
    } else if (arg === '--min-delay' && args[i + 1]) {
      options.minJitterMs = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--max-delay' && args[i + 1]) {
      options.maxJitterMs = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
======================================================================
  APIx Scraper CLI — National Airfare Price Index (MoSPI PS 26056)
======================================================================

Usage:
  npm run scrape -- [options]

Options:
  --routes <list>       Comma-separated route codes (e.g. DEL-BOM,DEL-GAU or 'all' for all 16 routes)
  --sources <list>      Target sources: easemytrip, cleartrip, akasa (default: all active)
  --windows <list>      Booking windows: T+1,T+7,T+15,T+30,T+45 (default: all)
  --strict              Enforce full basket coverage; fail with exit 1 if any route has 0 quotes
  --dry-run             Simulate scrape without opening live browsers
  --no-headless         Run Playwright in visible headful mode for debugging
  --min-delay <ms>      Minimum jitter delay per domain in ms (default: 3000)
  --max-delay <ms>      Maximum jitter delay per domain in ms (default: 7000)
  --help, -h            Show this help guide

Examples:
  npm run scrape -- --routes all --strict
  npm run scrape -- --sources easemytrip,cleartrip,akasa --routes all
  npm run scrape -- --dry-run
`);
}

async function main() {
  const options = parseArgs();
  const runner = new ScraperRunner(options);

  try {
    const summary = await runner.runBatch(options);
    
    // Evaluate Route Basket Coverage
    const targetRouteCount = options.routes && options.routes[0] !== 'all' ? options.routes.length : 16;
    const distinctSuccessfulRoutes = new Set(
      summary.results.filter((r) => r.success && r.quotes.length > 0).map((r) => r.task.route.id)
    );

    console.log(`\n----------------------------------------------------------------------`);
    console.log(`  BASKET COVERAGE AUDIT`);
    console.log(`  Target Routes:       ${targetRouteCount}`);
    console.log(`  Routes Captured:     ${distinctSuccessfulRoutes.size}/${targetRouteCount}`);
    console.log(`  Total Quotes:        ${summary.total_quotes_collected}`);
    console.log(`----------------------------------------------------------------------`);

    const isStrict = options.strict || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    if (isStrict && distinctSuccessfulRoutes.size < targetRouteCount) {
      console.error(`\n🚨 CRITICAL SCRAPER ALERT: Incomplete basket scrape! Captured only ${distinctSuccessfulRoutes.size}/${targetRouteCount} corridors.`);
      process.exit(1);
    }

    if (summary.failed_scrapes > 0 && summary.successful_scrapes === 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`\nFatal scraper error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
