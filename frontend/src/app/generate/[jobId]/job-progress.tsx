'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { createClient } from '@/lib/supabase/client';

export type JobRow = {
  id: string;
  product_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled';
  current_stage: string | null;
  error_code: string | null;
  attempt_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const STAGES = [
  'validating_image',
  'preparing_image',
  'generating_geometry',
  'processing_texture',
  'validating_model',
  'preparing_ar_asset',
] as const;
const TERMINAL = new Set(['succeeded', 'failed', 'timed_out', 'cancelled']);

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Live job progress. Follows the job row through Supabase Realtime (RLS limits
 * delivery to the owner) with a polling fallback. Shows only real stages
 * reported by the worker; no invented percentage.
 */
export function JobProgress({
  initial,
  cpuMode,
  t,
}: {
  initial: JobRow;
  cpuMode: boolean;
  t: Pick<Dictionary, 'gen' | 'common'>;
}) {
  const G = t.gen;
  const router = useRouter();
  const [job, setJob] = useState<JobRow>(initial);
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const done = TERMINAL.has(job.status);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/jobs/${initial.id}`, { cache: 'no-store' });
      if (r.ok) setJob((await r.json()) as JobRow);
    } catch {
      /* offline: banner handles it; next tick retries */
    }
  }, [initial.id]);

  // Realtime subscription
  useEffect(() => {
    if (TERMINAL.has(initial.status)) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`job-${initial.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'generation_jobs', filter: `id=eq.${initial.id}` },
        (payload) => setJob((prev) => ({ ...prev, ...(payload.new as Partial<JobRow>) })),
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initial.id, initial.status]);

  // Polling fallback (fast when Realtime is not connected, slow safety net otherwise)
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => void poll(), live ? 15_000 : 3_000);
    return () => clearInterval(t);
  }, [done, live, poll]);

  // Elapsed-time ticker
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);

  const startedAt = Date.parse(job.started_at ?? job.created_at);
  const endedAt = job.completed_at ? Date.parse(job.completed_at) : now;
  const currentIndex =
    job.status === 'succeeded'
      ? STAGES.length
      : Math.max(0, STAGES.indexOf((job.current_stage ?? '') as (typeof STAGES)[number]));

  async function cancel() {
    setBusy(true);
    setActionError(null);
    const r = await fetch(`/api/jobs/${job.id}/cancel`, { method: 'POST' }).catch(() => null);
    if (r?.ok) await poll();
    else setActionError(G.errors.INTERNAL_ERROR!);
    setBusy(false);
  }

  async function retry() {
    setBusy(true);
    setActionError(null);
    const r = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: job.product_id }),
    }).catch(() => null);
    const body = r ? await r.json().catch(() => ({})) : {};
    if (r?.status === 201 || (body.error === 'JOB_ALREADY_ACTIVE' && body.jobId)) {
      router.push(`/generate/${body.jobId}`);
      return;
    }
    setActionError(
      body.error === 'DAILY_QUOTA_REACHED' ? G.quotaReached : body.error === 'QUEUE_FULL' ? G.queueFull : G.unavailable,
    );
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            job.status === 'succeeded' ? 'bg-sage-soft' : done ? 'bg-danger-soft text-danger' : 'bg-cream'
          }`}
          role="status"
        >
          {G.status[job.status]}
        </p>
        <p className="text-sm text-ink-soft tabular-nums">
          {G.elapsed}: {fmt(endedAt - startedAt)}
          {!done && <span className="ml-3">· {live ? G.live : G.polling}</span>}
        </p>
      </div>

      {cpuMode && !done && <p className="rounded-xl bg-warn-soft p-4 text-sm">{G.cpuWarning}</p>}

      <ol className="space-y-2" aria-label={G.title}>
        {STAGES.map((s, i) => {
          const state =
            job.status === 'succeeded' || i < currentIndex
              ? 'done'
              : i === currentIndex && job.status === 'running'
                ? 'active'
                : i === currentIndex && done
                  ? 'stopped'
                  : 'todo';
          return (
            <li key={s} className="flex items-center gap-3 card px-4 py-3" aria-current={state === 'active' ? 'step' : undefined}>
              <span
                aria-hidden="true"
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs ${
                  state === 'done'
                    ? 'bg-sage text-white'
                    : state === 'active'
                      ? 'animate-pulse bg-nila text-white'
                      : state === 'stopped'
                        ? 'bg-danger text-white'
                        : 'bg-cream text-ink-soft'
                }`}
              >
                {state === 'done' ? '✓' : state === 'stopped' ? '!' : i + 1}
              </span>
              <span className={state === 'todo' ? 'text-ink-soft' : 'text-ink'}>{G.stages[s]}</span>
              <span className="sr-only">{state}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-ink-soft">{G.noPercent}</p>

      {done && job.status !== 'succeeded' && (
        <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">
          {G.errors[job.error_code ?? 'INTERNAL_ERROR'] ?? G.errors.INTERNAL_ERROR}
        </p>
      )}
      <div aria-live="polite">{actionError && <p className="text-sm text-danger">{actionError}</p>}</div>

      <div className="flex flex-wrap gap-3">
        {!done && (
          <button type="button" className="btn-secondary" onClick={cancel} disabled={busy}>
            {G.cancel}
          </button>
        )}
        {job.status === 'succeeded' && (
          <a href={`/model/${job.product_id}`} className="btn-primary">
            {G.openModel}
          </a>
        )}
        {done && job.status !== 'succeeded' && (
          <button type="button" className="btn-primary" onClick={retry} disabled={busy}>
            {G.retry}
          </button>
        )}
        <a href={`/studio/${job.product_id}`} className="btn-ghost">
          {G.backToResult}
        </a>
      </div>
    </div>
  );
}
