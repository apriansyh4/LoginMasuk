'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionaries';

type Props = {
  productId: string;
  available: boolean;
  cpuMode: boolean;
  quota: { remaining: number; limit: number };
  activeJobId: string | null;
  label: string;
  t: Pick<Dictionary, 'gen' | 'common'>;
};

/** Starts a generation job and moves to the live progress page. */
export function GenerateButton({ productId, available, cpuMode, quota, activeJobId, label, t }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const G = t.gen;

  if (activeJobId) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ink-soft">{G.alreadyActive}</p>
        <a href={`/generate/${activeJobId}`} className="btn-primary">
          {G.title}
        </a>
      </div>
    );
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.status === 201) {
        router.push(`/generate/${body.jobId}`);
        return;
      }
      if (body.error === 'JOB_ALREADY_ACTIVE' && body.jobId) {
        router.push(`/generate/${body.jobId}`);
        return;
      }
      setError(
        body.error === 'DAILY_QUOTA_REACHED'
          ? G.quotaReached
          : body.error === 'QUEUE_FULL'
            ? G.queueFull
            : body.error === 'GENERATION_UNAVAILABLE' || body.error === 'ENGINE_UNAVAILABLE'
              ? G.unavailable
              : (G.errors[body.error] ?? G.errors.INTERNAL_ERROR!),
      );
    } catch {
      setError(t.common.offline);
    }
    setBusy(false);
  }

  const noQuota = quota.remaining <= 0;
  return (
    <div className="space-y-3">
      <button
        type="button"
        className="btn-primary"
        onClick={start}
        disabled={!available || noQuota || busy}
        aria-describedby="gen-help"
      >
        {busy ? G.starting : label}
      </button>
      <div id="gen-help" className="space-y-1 text-sm text-ink-soft">
        {!available && <p>{G.unavailable}</p>}
        {available && <p>{G.quota.replace('{n}', String(quota.remaining)).replace('{m}', String(quota.limit))}</p>}
        {available && noQuota && <p className="text-danger">{G.quotaReached}</p>}
        {available && cpuMode && <p className="rounded-lg bg-warn-soft px-3 py-2 text-ink">{G.cpuWarning}</p>}
      </div>
      <div aria-live="polite">{error && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}</div>
    </div>
  );
}
