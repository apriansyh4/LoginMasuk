'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionaries';

type Health = { reachable: boolean; validationAvailable: boolean } | null;

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX = 10 * 1024 * 1024;

export function StudioForm({ t }: { t: Pick<Dictionary, 'studio' | 'history' | 'common'> }) {
  const S = t.studio;
  const router = useRouter();
  const ids = { file: useId(), name: useId(), rights: useId() };
  const [health, setHealth] = useState<Health>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [size, setSize] = useState({ height: '', width: '', depth: '' });
  const [rights, setRights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [checking, setChecking] = useState(false);
  const loadHealth = useCallback(async () => {
    let next: Health;
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      next = r.ok ? ((await r.json()) as Health) : { reachable: false, validationAvailable: false };
    } catch {
      next = { reachable: false, validationAvailable: false };
    }
    setHealth(next);
  }, []);
  const recheck = useCallback(async () => {
    setChecking(true);
    await loadHealth();
    setChecking(false);
  }, [loadHealth]);

  useEffect(() => {
    let alive = true;
    const run = () => {
      if (alive) void loadHealth();
    };
    const first = setTimeout(run, 0);
    return () => {
      alive = false;
      clearTimeout(first);
    };
  }, [loadHealth]);

  // While the AI service is down, re-check periodically so the page recovers by itself.
  useEffect(() => {
    if (!health || health.validationAvailable) return;
    const t = setInterval(() => void loadHealth(), 15_000);
    return () => clearInterval(t);
  }, [health, loadHealth]);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  // Marketplaces block automated reading, so the seller always uploads the photo.
  const imageChosen = Boolean(file);
  const fileProblem = file && (file.size > MAX || !ACCEPT.split(',').includes(file.type)) ? S.requirements[0] : null;
  const serviceDown = health !== null && !health.validationAvailable;
  const canSubmit = imageChosen && !fileProblem && rights && !submitting && !serviceDown;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    fd.set('source', 'upload');
    fd.set('rightsConfirmed', 'true');
    if (name.trim()) fd.set('name', name.trim());
    if (file) fd.set('file', file);
    const dims = Object.fromEntries(
      Object.entries(size)
        .filter(([, v]) => v.trim() !== '')
        .map(([k, v]) => [k, Number(v)]),
    );
    if (Object.keys(dims).length) fd.set('size', JSON.stringify(dims));
    try {
      const r = await fetch('/api/submissions', { method: 'POST', body: fd });
      const body = await r.json().catch(() => ({}));
      if (r.status === 201) {
        router.push(`/studio/${body.productId}`);
        return;
      }
      if (r.status === 503) setError(body.error === 'SERVICE_UNAVAILABLE' ? S.serverProblem : S.serviceDown);
      else if (r.status === 429) setError(S.rateLimited);
      else if (r.status === 413) setError(S.requirements[0]!);
      else setError(S.genericError);
    } catch {
      setError(t.common.offline);
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} className="space-y-8" aria-busy={submitting}>
      {serviceDown && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warn-soft p-4 text-sm">
          <p>{S.serviceDown}</p>
          <button type="button" className="btn-secondary min-h-9 px-4" onClick={() => void recheck()} disabled={checking}>
            {checking ? t.common.loading : S.recheck}
          </button>
        </div>
      )}

      <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="label">{S.fileLabel}</p>
          <label
            htmlFor={ids.file}
            className="flex min-h-72 cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed border-ink bg-kunyit-soft p-5 text-center transition-colors focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-nila hover:bg-kunyit/30"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={preview} alt={S.fileLabel} className="max-h-64 w-auto rounded-lg object-contain" />
            ) : (
              <>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 48 48"
                  className="size-14 text-ink"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M6 16a4 4 0 0 1 4-4h6l3-5h10l3 5h6a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" />
                  <circle cx="24" cy="25" r="8" />
                </svg>
                <span className="text-lg font-extrabold">{S.pickFile}</span>
                <span className="text-sm text-ink-soft">{S.pickFileHint}</span>
              </>
            )}
            {file && (
              <span className="text-sm">
                <span className="break-all text-ink-soft">{file.name}</span>{' '}
                <span className="font-bold text-nila underline">{S.changeFile}</span>
              </span>
            )}
          </label>
          <input
            id={ids.file}
            type="file"
            accept={ACCEPT}
            aria-label={S.fileLabel}
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {fileProblem && <p className="mt-2 text-sm font-semibold text-danger">{fileProblem}</p>}
        </div>
        <div className="self-start rounded-[var(--radius-card)] bg-cream p-5">
          <p className="font-bold">{S.tipsTitle}</p>
          <ul className="mt-3 space-y-2 text-sm text-ink-soft">
            {S.requirements.map((r) => (
              <li key={r} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-kunyit" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <label htmlFor={ids.name} className="label">
            {S.nameLabel}
          </label>
          <input id={ids.name} className="field" maxLength={300} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <fieldset>
          <legend className="label">{S.sizeLabel}</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['height', 'width', 'depth'] as const).map((k) => (
              <label key={k} className="text-xs text-ink-soft">
                {S[k]}
                <input
                  type="number"
                  min={0.1}
                  max={500}
                  step={0.1}
                  inputMode="decimal"
                  className="mt-1 field"
                  value={size[k]}
                  onChange={(e) => setSize({ ...size, [k]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-ink-soft">{S.sizeHelp}</p>
        </fieldset>
      </section>

      <div className="flex gap-3 rounded-xl bg-cream p-4">
        <input
          id={ids.rights}
          type="checkbox"
          checked={rights}
          onChange={(e) => setRights(e.target.checked)}
          className="mt-1 size-5 accent-nila"
        />
        <label htmlFor={ids.rights} className="text-sm">
          {S.rights}
        </label>
      </div>

      <div aria-live="polite">{error && <p className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}</div>

      <button type="submit" className="btn-primary px-8" disabled={!canSubmit}>
        {submitting ? S.validating : S.submit}
      </button>
    </form>
  );
}
