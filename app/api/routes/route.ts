import { NextRequest } from 'next/server';
import { apiSuccess, apiError } from '@/lib/api/response';
import { checkRateLimit } from '@/lib/api/rate-limiter';
import { DGCA_ROUTE_BASKET } from '@/lib/mock-data';

export async function GET(request: NextRequest) {
  const rateLimit = await checkRateLimit(request);
  if (!rateLimit.allowed) {
    return apiError(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit exceeded. Try again in ${rateLimit.reset} seconds.`,
      429,
      undefined,
      rateLimit.headers
    );
  }

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get('active_only') !== 'false';

  let routes = DGCA_ROUTE_BASKET;
  if (activeOnly) {
    routes = routes.filter((r) => r.active);
  }

  const payload = routes.map((r) => ({
    id: r.id,
    origin_code: r.origin_code,
    origin_city: r.origin_city,
    destination_code: r.destination_code,
    destination_city: r.destination_city,
    dgca_traffic_weight: r.dgca_traffic_weight,
    dgca_traffic_share_pct: Number((r.dgca_traffic_weight * 100).toFixed(2)),
    distance_km: r.distance_km,
    daily_flights_avg: r.daily_flights_avg,
    active: r.active,
  }));

  const totalWeight = Number(
    payload.reduce((acc, r) => acc + r.dgca_traffic_weight, 0).toFixed(4)
  );

  return apiSuccess(
    payload,
    payload.length,
    {
      total_basket_weight: totalWeight,
      dgca_source_year: '2025/2026',
      total_national_volume_coverage_pct: 86.8,
    },
    rateLimit.headers
  );
}
