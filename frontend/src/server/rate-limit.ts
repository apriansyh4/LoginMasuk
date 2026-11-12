import 'server-only';
import { createServiceClient } from '@/lib/supabase/server';

export class RateLimited extends Error {
  constructor(public readonly bucket: string) {
    super('RATE_LIMITED');
  }
}

/** Postgres-backed fixed-window limiter (public.rate_limit_hit). Fails closed on DB error. */
export async function hitRateLimit(bucket: string, subject: string, windowSeconds: number, max: number): Promise<void> {
  const db = createServiceClient();
  const { data, error } = await db.rpc('rate_limit_hit', {
    p_bucket: bucket,
    p_subject: subject,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error || data !== true) throw new RateLimited(bucket);
}
