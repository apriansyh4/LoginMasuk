import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from '@/server/auth';
import { RateLimited, RateLimiterUnavailable } from '@/server/rate-limit';

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { 'cache-control': 'no-store' } });
}

/** CSRF defence for state-changing requests: require a same-origin Origin header. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host) throw new AuthError(403, 'BAD_ORIGIN');
  try {
    if (new URL(origin).host !== host) throw new AuthError(403, 'BAD_ORIGIN');
  } catch {
    throw new AuthError(403, 'BAD_ORIGIN');
  }
}

/** Wrap a route handler: maps known errors to JSON, never leaks internals. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AuthError) return jsonError(e.status, e.code);
      if (e instanceof RateLimited) return jsonError(429, 'RATE_LIMITED', { bucket: e.bucket });
      if (e instanceof RateLimiterUnavailable) return jsonError(503, 'SERVICE_UNAVAILABLE');
      if (e instanceof ZodError) return jsonError(400, 'INVALID_INPUT', { issues: e.issues.map((i) => i.path.join('.')) });
      console.error(JSON.stringify({ level: 'error', msg: 'route_error', name: e instanceof Error ? e.name : 'unknown' }));
      return jsonError(500, 'INTERNAL_ERROR');
    }
  };
}
