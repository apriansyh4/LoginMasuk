'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionaries';

type Mode = 'url' | 'upload';
type Health = { reachable: boolean; validationAvailable: boolean } | null;
type Resolved = {
  ok: true;
  marketplace: 'shopee' | 'tokopedia';
  originalUrl: string;
  metadataStatus: 'ok' | 'unavailable';
  metadata: {
    title: string | null;
    price: number | null;
    currency: string | null;
    seller: string | null;
    images: string[];
  } | null;
};

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX = 10 * 1024 * 1024;

export function StudioForm({ t }: { t: Pick<Dictionary, 'studio' | 'urlErrors' | 'history' | 'common'> }) {
  const S = t.studio;
  const router = useRouter();
  const ids = { url: useId(), file: useId(), name: useId(), rights: useId() };
  const [mode, setMode] = useState<Mode>('upload');
  const [health, setHealth] = useState<Health>(null);
  const [url, setUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [pickedImage, setPickedImage] = useState<string | null>(null);
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

  const needsUpload =
    mode === 'upload' || (resolved !== null && (resolved.metadataStatus !== 'ok' || !resolved.metadata?.images.length));
  const imageChosen = needsUpload ? Boolean(file) : Boolean(pickedImage);
  const fileProblem = file && (file.size > MAX || !ACCEPT.split(',').includes(file.type)) ? S.requirements[0] : null;
  const serviceDown = health !== null && !health.validationAvailable;
  const canSubmit = imageChosen && !fileProblem && rights && !submitting && !serviceDown && (mode === 'upload' || resolved);

  function urlError(code: string): string {
    if (code.startsWith('SHORT_LINK')) return t.urlErrors.SHORT_LINK;
    return (t.urlErrors as Record<string, string>)[code] ?? t.urlErrors.INVALID_URL;
  }

  async function checkUrl() {
    setError(null);
    setResolved(null);
    setPickedImage(null);
    setResolving(true);
    try {
      const r = await fetch('/api/marketplace/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const body = await r.json();
      if (r.status === 429) setError(S.rateLimited);
      else if (!body.ok) setError(urlError(body.code ?? body.error ?? 'INVALID_URL'));
      else {
        setResolved(body as Resolved);
        if (body.metadata?.title && !name) setName(body.metadata.title);
      }
    } catch {
      setError(t.common.offline);
    } finally {
      setResolving(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    fd.set('source', mode === 'url' ? 'marketplace' : 'upload');
    fd.set('rightsConfirmed', 'true');
    if (name.trim()) fd.set('name', name.trim());
    if (mode === 'url' && resolved) fd.set('productUrl', resolved.originalUrl);
    if (needsUpload && file) fd.set('file', file);
    else if (pickedImage) fd.set('imageUrl', pickedImage);
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
      else setError(body.error && body.error in t.urlErrors ? urlError(body.error) : S.genericError);
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

      <div role="radiogroup" aria-label="Input" className="inline-flex rounded-full border border-sand bg-white p-1">
        {(['upload', 'url'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${mode === m ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
          >
            {m === 'url' ? S.tabUrl : S.tabUpload}
          </button>
        ))}
      </div>

      {mode === 'url' && (
        <section className="space-y-4">
          <div>
            <label htmlFor={ids.url} className="label">
              {S.urlLabel}
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id={ids.url}
                type="url"
                inputMode="url"
                className="field"
                placeholder={S.urlPlaceholder}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setResolved(null);
                }}
              />
              <button type="button" className="btn-secondary shrink-0" disabled={!url.trim() || resolving} onClick={checkUrl}>
                {resolving ? t.common.loading : S.checkUrl}
              </button>
            </div>
          </div>
          {resolved && (
            <div className="space-y-4 card p-5">
              <p className="text-sm">
                <span className="font-medium">{t.history.source[resolved.marketplace]}</span> ·{' '}
                <span className="break-all text-ink-soft">{resolved.originalUrl}</span>
              </p>
              {resolved.metadata && (
                <dl className="grid gap-1 text-sm text-ink-soft">
                  {resolved.metadata.title && <dd className="text-ink">{resolved.metadata.title}</dd>}
                  {resolved.metadata.price !== null && resolved.metadata.currency && (
                    <dd>
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: resolved.metadata.currency }).format(
                        resolved.metadata.price,
                      )}
                    </dd>
                  )}
                  {resolved.metadata.seller && <dd>{resolved.metadata.seller}</dd>}
                </dl>
              )}
              {!needsUpload && resolved.metadata ? (
                <fieldset>
                  <legend className="label">{S.pickOne}</legend>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {resolved.metadata.images.map((src, i) => (
                      <label
                        key={src}
                        className={`relative cursor-pointer overflow-hidden rounded-xl border-2 ${pickedImage === src ? 'border-terracotta' : 'border-transparent'}`}
                      >
                        <input
                          type="radio"
                          name="listingImage"
                          value={src}
                          className="sr-only"
                          checked={pickedImage === src}
                          onChange={() => setPickedImage(src)}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element -- external listing image, allowlisted CDN */}
                        <img
                          src={src}
                          alt={`${i + 1}`}
                          referrerPolicy="no-referrer"
                          className="aspect-square w-full bg-cream object-cover"
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <p className="rounded-xl bg-warn-soft p-4 text-sm">{S.urlUnreadable}</p>
              )}
            </div>
          )}
        </section>
      )}

      {needsUpload && (
        <section className="grid gap-6 md:grid-cols-[1fr_1fr]">
          <div>
            <label htmlFor={ids.file} className="label">
              {S.fileLabel}
            </label>
            <input
              id={ids.file}
              type="file"
              accept={ACCEPT}
              className="field file:mr-4 file:rounded-full file:border-0 file:bg-cream file:px-4 file:py-2"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {S.requirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {fileProblem && <p className="mt-2 text-sm text-danger">{fileProblem}</p>}
          </div>
          <div className="flex min-h-56 items-center justify-center overflow-hidden card p-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={preview} alt={S.fileLabel} className="max-h-72 w-auto rounded-lg object-contain" />
            ) : (
              <p className="text-sm text-ink-soft">{S.fileLabel}</p>
            )}
          </div>
        </section>
      )}

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
          className="mt-1 size-5 accent-terracotta"
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
