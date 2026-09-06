import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import {
  checkRateLimit,
  getClientIp,
  MAX_REQUESTS_PER_WINDOW,
  _resetRatelimitInstance,
  getRatelimiter,
} from '../lib/api/rate-limiter';

function createMockRequest(headers: Record<string, string> = {}): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/index', {
    headers: new Headers(headers),
  });
  return req;
}

describe('Rate Limiter Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    _resetRatelimitInstance();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    _resetRatelimitInstance();
  });

  describe('IP Extraction', () => {
    it('extracts first IP from x-forwarded-for comma list', () => {
      const req = createMockRequest({
        'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
      });
      expect(getClientIp(req)).toBe('203.0.113.195');
    });

    it('extracts IP from x-real-ip if x-forwarded-for is absent', () => {
      const req = createMockRequest({
        'x-real-ip': '198.51.100.42',
      });
      expect(getClientIp(req)).toBe('198.51.100.42');
    });

    it('extracts IP from cf-connecting-ip if others are absent', () => {
      const req = createMockRequest({
        'cf-connecting-ip': '192.0.2.1',
      });
      expect(getClientIp(req)).toBe('192.0.2.1');
    });

    it('falls back to 127.0.0.1 when no IP headers are present', () => {
      const req = createMockRequest({});
      expect(getClientIp(req)).toBe('127.0.0.1');
    });
  });

  describe('Local Fallback Mode (Unconfigured KV)', () => {
    it('allows requests within the 60 req/min limit', async () => {
      const req = createMockRequest({ 'x-forwarded-for': '10.0.0.1' });
      const res = await checkRateLimit(req);

      expect(res.allowed).toBe(true);
      expect(res.limit).toBe(MAX_REQUESTS_PER_WINDOW);
      expect(res.remaining).toBe(59);
      expect(res.headers['X-RateLimit-Limit']).toBe('60');
      expect(res.headers['X-RateLimit-Remaining']).toBe('59');
      expect(Number(res.headers['X-RateLimit-Reset'])).toBeGreaterThan(0);
    });

    it('decrements remaining counter on sequential rapid requests', async () => {
      const ip = '10.0.0.2';
      for (let i = 1; i <= 5; i++) {
        const req = createMockRequest({ 'x-forwarded-for': ip });
        const res = await checkRateLimit(req);
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(60 - i);
      }
    });

    it('blocks request when exceeding 60 requests in window', async () => {
      const ip = '10.0.0.3';
      for (let i = 1; i <= 60; i++) {
        const req = createMockRequest({ 'x-forwarded-for': ip });
        const res = await checkRateLimit(req);
        expect(res.allowed).toBe(true);
      }

      // 61st request must be rejected
      const req61 = createMockRequest({ 'x-forwarded-for': ip });
      const res61 = await checkRateLimit(req61);

      expect(res61.allowed).toBe(false);
      expect(res61.remaining).toBe(0);
      expect(res61.headers['X-RateLimit-Remaining']).toBe('0');
    });

    it('isolates different client IPs', async () => {
      const req1 = createMockRequest({ 'x-forwarded-for': '10.0.0.4' });
      const req2 = createMockRequest({ 'x-forwarded-for': '10.0.0.5' });

      const res1 = await checkRateLimit(req1);
      const res2 = await checkRateLimit(req2);

      expect(res1.remaining).toBe(59);
      expect(res2.remaining).toBe(59);
    });
  });

  describe('Upstash / Vercel KV Fail-Open Resilience', () => {
    it('fails open when KV credentials are set but remote call fails', async () => {
      process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
      process.env.KV_REST_API_TOKEN = 'fake-token';
      _resetRatelimitInstance();

      // Mock global fetch to simulate network failure to Upstash
      const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ETIMEDOUT'));

      const req = createMockRequest({ 'x-forwarded-for': '10.0.0.6' });
      const res = await checkRateLimit(req);

      // Must fail open (allowed: true) so public API is not degraded
      expect(res.allowed).toBe(true);
      expect(res.limit).toBe(60);
      expect(res.remaining).toBe(59);
      expect(fetchSpy).toHaveBeenCalled();
    });

    it('fails open when Redis client returns 500 error', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://broken-redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
      _resetRatelimitInstance();

      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 })
      );

      const req = createMockRequest({ 'x-forwarded-for': '10.0.0.7' });
      const res = await checkRateLimit(req);

      expect(res.allowed).toBe(true);
      expect(res.limit).toBe(60);
    });
  });

  describe('Shared Multi-Instance Simulation', () => {
    it('enforces shared limit across separate serverless instances hitting Redis', async () => {
      process.env.KV_REST_API_URL = 'https://mock-kv.upstash.io';
      process.env.KV_REST_API_TOKEN = 'mock-token';
      _resetRatelimitInstance();

      let sharedCounter = 0;
      const resetTimestamp = Date.now() + 60000;

      const limiter = getRatelimiter();
      expect(limiter).not.toBeNull();

      // Mock Upstash Ratelimit limit execution
      vi.spyOn(limiter!, 'limit').mockImplementation(async () => {
        sharedCounter++;
        const allowed = sharedCounter <= 60;
        const remaining = Math.max(0, 60 - sharedCounter);
        return {
          success: allowed,
          limit: 60,
          remaining,
          reset: resetTimestamp,
          pending: Promise.resolve(),
        };
      });

      const clientIp = '198.51.100.99';

      // Instance A executes 30 requests
      for (let i = 0; i < 30; i++) {
        const req = createMockRequest({ 'x-forwarded-for': clientIp });
        const res = await checkRateLimit(req);
        expect(res.allowed).toBe(true);
        expect(res.headers['X-RateLimit-Scope']).toBe('global');
      }

      // Instance B executes 30 requests (simulating a different serverless container)
      for (let i = 0; i < 30; i++) {
        const req = createMockRequest({ 'x-forwarded-for': clientIp });
        const res = await checkRateLimit(req);
        expect(res.allowed).toBe(true);
        expect(res.headers['X-RateLimit-Scope']).toBe('global');
      }

      // Total requests = 60. Request 61 on Instance A must be BLOCKED
      const reqBlocked = createMockRequest({ 'x-forwarded-for': clientIp });
      const resBlocked = await checkRateLimit(reqBlocked);

      expect(resBlocked.allowed).toBe(false);
      expect(resBlocked.remaining).toBe(0);
      expect(resBlocked.headers['X-RateLimit-Remaining']).toBe('0');
      expect(resBlocked.headers['X-RateLimit-Scope']).toBe('global');
    });
  });
});
