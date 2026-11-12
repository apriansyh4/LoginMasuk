import 'server-only';
import { createServiceClient } from '@/lib/supabase/server';

export class RateLimited extends Error {
  constructor(public readonly bucket: string) {
    super('RATE_LIMITED');
  }
}

/** The limiter itself could not be reached (DB down, migrations missing, wrong key). */
export class RateLimiterUnavailable extends Error {
  constructor(public readonly reason: string) {
    super('RATE_LIMITER_UNAVAILABLE');
  }
}

/**
 * Postgres-backed fixed-window limiter (public.rate_limit_hit).
 * Fails closed: if the limiter cannot be reached the request is refused, but
 * with a distinct error so the user is not told "too many attempts".
 */
export async function hitRateLimit(bucket: string, subject: string, windowSeconds: number, max: number): Promise<void> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('rate_limit_hit', {
    p_bucket: bucket,
    p_subject: subject,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'rate_limiter_unavailable',
        bucket,
        code: error.code,
        hint: error.message?.slice(0, 120),
      }),
    );
    throw new RateLimiterUnavailable(error.code ?? 'unknown');
  }
  if (data !== true) throw new RateLimited(bucket);
}
