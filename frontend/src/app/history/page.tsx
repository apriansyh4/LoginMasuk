import Link from 'next/link';
import { z } from 'zod';
import { parseReasons } from '@/components/reasons';
import { getDict } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/server/auth';
import { DeleteButton } from './delete-button';

export const metadata = { title: 'Riwayat' };

const PAGE_SIZE = 12;
const STATUSES = ['pending', 'validated', 'rejected', 'generating', 'ready', 'failed', 'disabled'] as const;
const SOURCES = ['none', 'shopee', 'tokopedia'] as const;

const query = z.object({
  status: z.enum(STATUSES).optional().catch(undefined),
  source: z.enum(SOURCES).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageUser('/history');
  const { t } = await getDict();
  const H = t.history;
  const f = query.parse(await searchParams);
  const supabase = await createClient();

  let req = supabase
    .from('submission_history')
    .select(
      'id, name, marketplace, original_product_url, original_image_key, status, quality_score, quality_status, rejection_reasons, created_at, job_id',
      {
        count: 'exact',
      },
    )
    .order('created_at', { ascending: false })
    .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (f.status) req = req.eq('status', f.status);
  if (f.source) req = req.eq('marketplace', f.source);
  if (f.q) req = req.ilike('name', `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const { data: rows, count, error } = await req;

  const keys = (rows ?? []).map((r) => r.original_image_key).filter((k): k is string => Boolean(k));
  const signed = keys.length ? ((await supabase.storage.from('uploads').createSignedUrls(keys, 600)).data ?? []) : [];
  const urlFor = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (p: Partial<typeof f>) => {
    const s = new URLSearchParams();
    const m = { ...f, ...p };
    if (m.status) s.set('status', m.status);
    if (m.source) s.set('source', m.source);
    if (m.q) s.set('q', m.q);
    if (m.page && m.page > 1) s.set('page', String(m.page));
    return `/history${s.size ? `?${s}` : ''}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold">{H.title}</h1>
        <Link href="/studio" className="btn-primary">
          {t.landing.cta}
        </Link>
      </div>

      <form method="get" className="mt-8 grid gap-4 card p-5 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="text-sm">
          <span className="label">{H.search}</span>
          <input name="q" defaultValue={f.q} className="field" />
        </label>
        <label className="text-sm">
          <span className="label">{H.filterStatus}</span>
          <select name="status" defaultValue={f.status ?? ''} className="field">
            <option value="">{H.all}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {H.status[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">{H.filterSource}</span>
          <select name="source" defaultValue={f.source ?? ''} className="field">
            <option value="">{H.all}</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {H.source[s]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary" type="submit">
          {H.apply}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger">
          {t.auth.errorGeneric}
        </p>
      )}
      {!error && (rows ?? []).length === 0 && (
        <div className="mt-8 card p-10 text-center text-ink-soft">
          <p>{H.empty}</p>
          <Link href="/studio" className="mt-6 btn-primary">
            {t.nav.studio}
          </Link>
        </div>
      )}

      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(rows ?? []).map((r) => {
          const thumb = r.original_image_key ? urlFor.get(r.original_image_key) : undefined;
          const reasons = parseReasons(r.rejection_reasons);
          const status = (r.status ?? 'pending') as (typeof STATUSES)[number];
          return (
            <li key={r.id} className="flex flex-col overflow-hidden card">
              <div className="flex aspect-[4/3] items-center justify-center bg-cream">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={thumb} alt={r.name ?? ''} className="h-full w-full object-contain p-3" loading="lazy" />
                ) : (
                  <span className="text-sm text-ink-soft">—</span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-ink">{r.name ?? H.untitled}</p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      status === 'rejected' || status === 'failed'
                        ? 'bg-danger-soft text-danger'
                        : status === 'ready' || status === 'validated'
                          ? 'bg-sage-soft text-ink'
                          : 'bg-cream text-ink'
                    }`}
                  >
                    {H.status[status]}
                  </span>
                </div>
                <p className="text-ink-soft">
                  {H.source[(r.marketplace ?? 'none') as (typeof SOURCES)[number]]} ·{' '}
                  <time dateTime={r.created_at ?? undefined}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('id-ID') : ''}
                  </time>
                  {r.quality_score != null && (
                    <>
                      {' '}
                      · {t.result.score}: {r.quality_score}
                    </>
                  )}
                  {r.quality_status && <> · {t.model.quality[r.quality_status as 'good' | 'fair' | 'poor']}</>}
                </p>
                {r.original_product_url && (
                  <a
                    href={r.original_product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-indigo underline"
                  >
                    {H.originalLink}
                  </a>
                )}
                {reasons.length > 0 && (
                  <p className="text-danger">
                    {(t.reasons as Record<string, { title: string }>)[reasons[0]!.code]?.title ?? reasons[0]!.code}
                  </p>
                )}
                <div className="mt-auto flex gap-2 pt-3">
                  <Link href={status === 'ready' ? `/model/${r.id}` : `/studio/${r.id}`} className="btn-secondary min-h-9 px-4">
                    {H.open}
                  </Link>
                  {r.job_id && status === 'generating' && (
                    <Link href={`/generate/${r.job_id}`} className="btn-ghost min-h-9 px-4">
                      {t.gen.status.running}
                    </Link>
                  )}
                  {(status === 'validated' || status === 'failed' || status === 'ready') && (
                    <Link href={`/studio/${r.id}`} className="btn-ghost min-h-9 px-4">
                      {status === 'validated' ? t.gen.start : t.gen.regenerate}
                    </Link>
                  )}
                  <DeleteButton id={r.id!} label={H.delete} confirmText={H.confirmDelete} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <nav aria-label="Halaman" className="mt-8 flex items-center justify-center gap-3 text-sm">
          {f.page > 1 && (
            <Link className="btn-secondary" href={qs({ page: f.page - 1 })}>
              {H.prev}
            </Link>
          )}
          <span className="text-ink-soft tabular-nums">
            {f.page} / {pages}
          </span>
          {f.page < pages && (
            <Link className="btn-secondary" href={qs({ page: f.page + 1 })}>
              {H.next}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
