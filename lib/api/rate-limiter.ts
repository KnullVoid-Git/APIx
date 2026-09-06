import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  headers: Record<string, string>;
}

export const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_SECONDS * 1000;

// Local in-memory fallback store
interface FallbackRecord {
  count: number;
  resetTime: number;
}
const localIpStore = new Map<string, FallbackRecord>();

// Periodic local cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of localIpStore.entries()) {
      if (now > record.resetTime) {
        localIpStore.delete(ip);
      }
    }
  }, 5 * 60 * 1000);
}

// Lazy-initialized Ratelimit singleton
let ratelimitInstance: Ratelimit | null = null;
let isConfigured: boolean | null = null;

export function getRatelimiter(): Ratelimit | null {
  if (ratelimitInstance) return ratelimitInstance;
  if (isConfigured === false) return null;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    isConfigured = false;
    return null;
  }

  try {
    const redis = new Redis({
      url,
      token,
    });

    ratelimitInstance = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(MAX_REQUESTS_PER_WINDOW, `${RATE_LIMIT_WINDOW_SECONDS} s`),
      analytics: false,
      prefix: 'apix:ratelimit',
      timeout: 1200, // 1.2s timeout to ensure low-latency response and prevent stalling
    });
    isConfigured = true;
    return ratelimitInstance;
  } catch (err) {
    console.warn('[RateLimit] Failed to initialize Upstash/KV client:', (err as Error).message);
    isConfigured = false;
    return null;
  }
}

// Reset instance cache for testing
export function _resetRatelimitInstance() {
  ratelimitInstance = null;
  isConfigured = null;
  localIpStore.clear();
}

function checkLocalFallback(ip: string): { allowed: boolean; remaining: number; reset: number } {
  const now = Date.now();
  let record = localIpStore.get(ip);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };
    localIpStore.set(ip, record);
  } else {
    record.count++;
  }

  const remaining = Math.max(0, MAX_REQUESTS_PER_WINDOW - record.count);
  const resetSeconds = Math.ceil((record.resetTime - now) / 1000);
  const allowed = record.count <= MAX_REQUESTS_PER_WINDOW;

  return { allowed, remaining, reset: resetSeconds };
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  return '127.0.0.1';
}

/**
 * Checks API rate limit for the incoming request.
 * Enforces a shared global limit across all serverless instances via Vercel KV / Upstash Redis.
 * Fails open (allows request through) if the shared store is unreachable.
 */
export async function checkRateLimit(request: NextRequest): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  const limiter = getRatelimiter();

  if (limiter) {
    try {
      const result = await limiter.limit(ip);
      
      // If Upstash timed out internally, it returns { success: true, limit: 0, remaining: 0, reset: 0 }
      if (result.limit === 0 && !result.reset) {
        const local = checkLocalFallback(ip);
        return {
          allowed: true, // Fail-open guarantee
          limit: MAX_REQUESTS_PER_WINDOW,
          remaining: local.remaining,
          reset: local.reset,
          headers: {
            'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
            'X-RateLimit-Remaining': String(local.remaining),
            'X-RateLimit-Reset': String(local.reset),
            'X-RateLimit-Scope': 'global-fallback',
          },
        };
      }

      const resetSeconds = Math.max(0, Math.ceil((result.reset - Date.now()) / 1000));
      const remaining = Math.max(0, result.remaining);

      return {
        allowed: result.success,
        limit: MAX_REQUESTS_PER_WINDOW,
        remaining,
        reset: resetSeconds,
        headers: {
          'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(resetSeconds),
          'X-RateLimit-Scope': 'global',
        },
      };
    } catch (err) {
      console.warn('[RateLimit] Error querying shared KV store, failing open:', (err as Error).message);
      // Fall through to fail-open fallback
    }
  }

  // Fallback mode (when KV store is not configured or temporarily unreachable)
  // Maintains local memory tracking while guaranteeing fail-open availability
  const local = checkLocalFallback(ip);
  return {
    allowed: local.allowed,
    limit: MAX_REQUESTS_PER_WINDOW,
    remaining: local.remaining,
    reset: local.reset,
    headers: {
      'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
      'X-RateLimit-Remaining': String(local.remaining),
      'X-RateLimit-Reset': String(local.reset),
      'X-RateLimit-Scope': limiter ? 'global-fallback' : 'local-instance',
    },
  };
}
