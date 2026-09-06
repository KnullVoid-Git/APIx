import { IScraperSource } from '../core/types';
import { EaseMyTripScraper } from './easemytrip';
import { CleartripScraper } from './cleartrip';
import { AkasaScraper } from './akasa';
import { AirIndiaScraper } from './airindia';

export class ScraperRegistry {
  private static instance: ScraperRegistry;
  private sources: Map<string, IScraperSource> = new Map();

  private constructor() {
    // Active compliant scraper sources only
    this.register(new EaseMyTripScraper());
    this.register(new CleartripScraper());
    this.register(new AkasaScraper());
  }

  public static getInstance(): ScraperRegistry {
    if (!ScraperRegistry.instance) {
      ScraperRegistry.instance = new ScraperRegistry();
    }
    return ScraperRegistry.instance;
  }

  public register(scraper: IScraperSource) {
    const rawName = scraper.name.toLowerCase();
    const normalizedKey = rawName.replace(/[-_ ]/g, '');
    this.sources.set(rawName, scraper);
    this.sources.set(normalizedKey, scraper);

    // Register common aliases
    if (normalizedKey === 'akasaair') {
      this.sources.set('akasa', scraper);
      this.sources.set('akasa-air', scraper);
    } else if (normalizedKey === 'airindia') {
      this.sources.set('air-india', scraper);
      this.sources.set('ai', scraper);
    } else if (normalizedKey === 'easemytrip') {
      this.sources.set('emt', scraper);
      this.sources.set('ease-my-trip', scraper);
    }
  }

  public get(name: string): IScraperSource | undefined {
    if (!name) return undefined;
    const raw = name.toLowerCase().trim();
    const normalized = raw.replace(/[-_ ]/g, '');

    // Direct check
    if (this.sources.has(raw)) return this.sources.get(raw);
    if (this.sources.has(normalized)) return this.sources.get(normalized);

    // Scan through registered sources
    for (const [k, v] of this.sources.entries()) {
      const normKey = k.toLowerCase().replace(/[-_ ]/g, '');
      if (normKey === normalized || normKey.startsWith(normalized) || normalized.startsWith(normKey)) {
        return v;
      }
    }
    return undefined;
  }

  public getAll(): IScraperSource[] {
    // Return distinct scrapers
    const distinct = new Set<IScraperSource>(this.sources.values());
    return Array.from(distinct);
  }

  public getNames(): string[] {
    const distinct = new Set<string>();
    for (const scraper of this.sources.values()) {
      distinct.add(scraper.name);
    }
    return Array.from(distinct);
  }
}
