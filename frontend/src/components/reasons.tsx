import type { Dictionary } from '@/lib/i18n/dictionaries';

export type StoredReason = { code: string; message?: string };

export function parseReasons(v: unknown): StoredReason[] {
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is StoredReason => typeof r === 'object' && r !== null && typeof (r as StoredReason).code === 'string');
}

/** Localised rejection reasons, each with an actionable tip. */
export function ReasonList({ reasons, t }: { reasons: StoredReason[]; t: Dictionary }) {
  return (
    <ul className="space-y-3">
      {reasons.map((r) => {
        const loc = (t.reasons as Record<string, { title: string; tip: string }>)[r.code];
        return (
          <li key={r.code} className="rounded-xl border border-danger/20 bg-danger-soft p-4">
            <p className="font-medium text-danger">{loc?.title ?? r.message ?? r.code}</p>
            {loc?.tip && <p className="mt-1 text-sm text-ink">{loc.tip}</p>}
            <p className="mt-1 font-mono text-[11px] text-ink-soft">{r.code}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const color = v >= 70 ? 'bg-sage' : v >= 45 ? 'bg-kunyit-dark' : 'bg-danger';
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-ink-soft tabular-nums">{v}</span>
      </div>
      <div
        className="mt-1 h-2 rounded-full bg-cream"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
      >
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
