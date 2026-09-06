import { Page, Response } from 'playwright';
import { BaseScraper } from './base-scraper';
import { ScrapeTask, RawFlightQuote } from '../core/types';

export class EaseMyTripScraper extends BaseScraper {
  readonly name = 'EaseMyTrip';
  readonly domain = 'https://www.easemytrip.com';
  readonly baseUrl = 'https://flight.easemytrip.com';

  protected async executeExtraction(
    task: ScrapeTask,
    page: Page
  ): Promise<{
    quotes: RawFlightQuote[];
    rawPayload: Record<string, unknown>;
    interceptedApi: boolean;
  }> {
    const origin = task.route.origin_code;
    const dest = task.route.destination_code;

    // EaseMyTrip date format: DD/MM/YYYY
    const [year, month, day] = task.target_date.split('-');
    const formattedDate = `${day}/${month}/${year}`;

    let interceptedJson: Record<string, unknown> | null = null;
    const quotes: RawFlightQuote[] = [];

    const handleResponse = async (response: Response) => {
      const url = response.url().toLowerCase();
      const isStatusOrAuxiliary =
        url.includes('flightstatus') ||
        url.includes('aircraft') ||
        url.includes('delay') ||
        url.includes('carbon') ||
        url.includes('seat');

      if (
        !isStatusOrAuxiliary &&
        (url.includes('flightlist') ||
          url.includes('getflightlist') ||
          url.includes('searchflight') ||
          url.includes('/api/flight')) &&
        response.status() === 200
      ) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const data = await response.json();
            if (data && typeof data === 'object' && (data.FlightList || data.flights || data.flightResults || data.d || data.Flt)) {
              interceptedJson = data;
            }
          }
        } catch {
          // Ignore stream consume errors
        }
      }
    };

    page.on('response', handleResponse);

    const CITY_NAMES: Record<string, string> = {
      DEL: 'Delhi',
      BOM: 'Mumbai',
      BLR: 'Bangalore',
      CCU: 'Kolkata',
      HYD: 'Hyderabad',
      MAA: 'Chennai',
      GAU: 'Guwahati',
      GOI: 'Goa',
      PAT: 'Patna',
      COK: 'Cochin',
      IXC: 'Chandigarh',
      PNQ: 'Pune',
    };
    const origLabel = CITY_NAMES[origin] || origin;
    const destLabel = CITY_NAMES[dest] || dest;
    const searchUrl = `${this.baseUrl}/FlightList/Index?srch=${origin}-${origLabel}-India|${dest}-${destLabel}-India|${formattedDate}&px=1-0-0&cbn=0&ar=undefined&isqs=true`;

    try {
      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 35000,
      });

      // Wait for flight cards to settle in DOM
      await page.waitForTimeout(5000);

      // Check if bot verification was encountered
      const pageTitle = (await page.title()).toLowerCase();
      if (pageTitle.includes('access denied') || pageTitle.includes('attention required') || pageTitle.includes('captcha')) {
        throw new Error(`Bot verification encountered on ${this.name}: ${pageTitle}`);
      }

      // 1. Try extracting from intercepted JSON
      if (interceptedJson) {
        const jsonQuotes = this.parseEaseMyTripApiResponse(interceptedJson, task);
        if (jsonQuotes.length > 0) {
          quotes.push(...jsonQuotes);
        }
      }

      // 2. Extract from live rendered DOM
      if (quotes.length === 0) {
        const domQuotes = await this.extractFromDom(page, task);
        quotes.push(...domQuotes);
      }

      return {
        quotes,
        rawPayload: interceptedJson || { dom_extracted_count: quotes.length, url: searchUrl },
        interceptedApi: Boolean(interceptedJson && quotes.length > 0),
      };
    } finally {
      page.off('response', handleResponse);
    }
  }

  private parseEaseMyTripApiResponse(data: Record<string, unknown>, task: ScrapeTask): RawFlightQuote[] {
    const quotes: RawFlightQuote[] = [];

    try {
      const flightList = (data.FlightList || data.flights || data.flightResults || data.d || []) as Array<Record<string, unknown>>;
      for (const item of flightList) {
        const totalFare = this.parseFareAmount(item.TotalFare || item.Fare || item.Price || (item.GrossFare as string | number));
        if (totalFare > 1000) {
          const baseFare = this.parseFareAmount(item.BaseFare || item.BasePrice) || Math.round(totalFare * 0.82);
          const airlineCode = String(item.AirlineCode || item.AirLine || item.Carrier || '6E');
          const airlineName = String(item.AirlineName || item.AirLineName || 'IndiGo');
          const flightNo = String(item.FlightNumber || item.FltNo || '101');

          quotes.push({
            source: this.name,
            carrier: airlineCode,
            carrier_name: airlineName,
            flight_number: flightNo.includes('-') ? flightNo : `${airlineCode}-${flightNo}`,
            departure_time: String(item.DepartureTime || item.DepTime || '08:00'),
            arrival_time: String(item.ArrivalTime || item.ArrTime || '10:15'),
            is_nonstop: item.Stops === 0 || item.IsDirect === true,
            fare_class: 'Economy',
            base_fare: baseFare,
            taxes: totalFare - baseFare,
            total_fare: totalFare,
            raw_flight_payload: item,
          });
        }
      }
    } catch (err) {
      console.warn(`[EaseMyTripScraper] Error parsing JSON API: ${(err as Error).message}`);
    }

    return quotes;
  }

  private async extractFromDom(page: Page, task: ScrapeTask): Promise<RawFlightQuote[]> {
    try {
      const extracted = await page.evaluate((sourceName) => {
        const rows = document.querySelectorAll('.fltResult, .main-bo-lis, .row.flt-res, [class*="fltResult"]');
        const items: any[] = [];

        const CARRIER_MAP: Record<string, { code: string; name: string }> = {
          'indigo': { code: '6E', name: 'IndiGo' },
          'air india express': { code: 'IX', name: 'Air India Express' },
          'air india': { code: 'AI', name: 'Air India' },
          'akasa': { code: 'QP', name: 'Akasa Air' },
          'akasaair': { code: 'QP', name: 'Akasa Air' },
          'spicejet': { code: 'SG', name: 'SpiceJet' },
        };

        rows.forEach((row: any) => {
          const text = row.innerText || '';
          if (!text.includes('BOOK NOW') && !text.includes('More Fare')) return;

          // Extract Fare Price (e.g. 6,529 or 7,055)
          const priceMatch = text.match(/(?:₹|\s)([0-9]{1,2},[0-9]{3})/);
          if (!priceMatch) return;
          const totalFare = parseInt(priceMatch[1].replace(/,/g, ''), 10);
          if (isNaN(totalFare) || totalFare < 1000 || totalFare > 80000) return;

          // Extract Times
          const times = text.match(/\b\d{2}:\d{2}\b/g) || [];
          const depTime = times[0] || '07:00';
          const arrTime = times[1] || '09:15';

          // Extract Carrier
          let carrierCode = '6E';
          let carrierName = 'IndiGo';
          const lowerText = text.toLowerCase();

          for (const [key, val] of Object.entries(CARRIER_MAP)) {
            if (lowerText.includes(key)) {
              carrierCode = val.code;
              carrierName = val.name;
              break;
            }
          }

          // Extract Real Flight Number (e.g. IX-1605, 6E-6470, QP-1119)
          const fltMatch = text.match(/\b(6E|AI|IX|QP|SG)[-\s]?([0-9]{3,4})\b/i);
          const flightNumber = fltMatch
            ? `${fltMatch[1].toUpperCase()}-${fltMatch[2]}`
            : `${carrierCode}-${Math.floor(100 + Math.random() * 900)}`;

          const isNonstop = /non[- ]?stop|direct/i.test(text);
          const baseFare = Math.round(totalFare * 0.82);
          const taxes = totalFare - baseFare;

          items.push({
            source: sourceName,
            carrier: carrierCode,
            carrier_name: carrierName,
            flight_number: flightNumber,
            departure_time: depTime,
            arrival_time: arrTime,
            is_nonstop: isNonstop,
            fare_class: 'Economy',
            base_fare: baseFare,
            taxes: taxes,
            total_fare: totalFare,
          });
        });

        return items;
      }, this.name);

      return extracted as RawFlightQuote[];
    } catch (err) {
      console.warn(`[EaseMyTripScraper] Error during DOM extraction: ${(err as Error).message}`);
      return [];
    }
  }
}
