import 'server-only';
import { serverEnv } from '@/lib/env';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getAiHealth, submitAiJob } from '@/server/ai-service';

export type StartResult = { ok: true; jobId: string } | { ok: false; status: number; error: string; activeJobId?: string };

const DAY_MS = 86_400_000;

export async function quotaFor(userId: string): Promise<{ limit: number; used: number; remaining: number }> {
  const limit = serverEnv().GENERATION_DAILY_LIMIT;
  const db = createServiceClient();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { count } = await db
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)
    .not('error_code', 'in', '(SERVICE_RESTARTED,ENGINE_UNAVAILABLE,QUEUE_FULL)'); // service faults do not cost quota
  const used = count ?? 0;
  return { limit, used, remaining: Math.max(0, limit - used) };
}

/**
 * Create a generation job for a product the user owns. The database trigger
 * additionally refuses any job without a passing validation of the same user
 * and product, so the gate holds even if this code had a bug.
 */
export async function startGeneration(userId: string, productId: string): Promise<StartResult> {
  const supabase = await createClient(); // RLS: proves ownership
  const { data: product } = await supabase.from('products').select('id').eq('id', productId).maybeSingle();
  if (!product) return { ok: false, status: 404, error: 'NOT_FOUND' };

  const { data: validation } = await supabase
    .from('image_validations')
    .select('id, is_valid')
    .eq('product_id', productId)
    .order('validated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!validation?.is_valid) return { ok: false, status: 409, error: 'VALIDATION_NOT_PASSED' };

  const { data: active } = await supabase
    .from('generation_jobs')
    .select('id')
    .eq('product_id', productId)
    .in('status', ['queued', 'running'])
    .limit(1)
    .maybeSingle();
  if (active) return { ok: false, status: 409, error: 'JOB_ALREADY_ACTIVE', activeJobId: active.id };

  const quota = await quotaFor(userId);
  if (quota.remaining <= 0) return { ok: false, status: 429, error: 'DAILY_QUOTA_REACHED' };

  const db = createServiceClient();
  const { count: queued } = await db
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'running']);
  if ((queued ?? 0) >= serverEnv().GENERATION_QUEUE_CAP) return { ok: false, status: 429, error: 'QUEUE_FULL' };

  const health = await getAiHealth();
  if (!health?.reconstructionAvailable) return { ok: false, status: 503, error: 'GENERATION_UNAVAILABLE' };

  const { data: job, error } = await db
    .from('generation_jobs')
    .insert({ product_id: productId, validation_id: validation.id, user_id: userId, status: 'queued' })
    .select('id')
    .single();
  if (error || !job) {
    // unique partial index: a concurrent request created the active job first
    if (error?.code === '23505') return { ok: false, status: 409, error: 'JOB_ALREADY_ACTIVE' };
    return { ok: false, status: 500, error: 'DB_FAILED' };
  }

  const submitted = await submitAiJob(job.id);
  if (!submitted.ok) {
    await db
      .from('generation_jobs')
      .update({
        status: 'failed',
        error_code: submitted.error,
        error_message: 'The 3D service could not accept the job. Please retry later.',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'queued');
    return { ok: false, status: submitted.error === 'QUEUE_FULL' ? 429 : 503, error: submitted.error };
  }
  return { ok: true, jobId: job.id };
}

/** Cancel a queued/running job the user owns. The worker stops at its next checkpoint. */
export async function cancelJob(jobId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: job } = await supabase.from('generation_jobs').select('id, status').eq('id', jobId).maybeSingle();
  if (!job || !['queued', 'running'].includes(job.status)) return false;
  const db = createServiceClient();
  const { data } = await db
    .from('generation_jobs')
    .update({
      status: 'cancelled',
      error_code: 'CANCELLED',
      error_message: 'Generation was cancelled.',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .in('status', ['queued', 'running'])
    .select('id');
  return (data ?? []).length === 1;
}
