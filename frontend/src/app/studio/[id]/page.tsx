import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { parseReasons, ReasonList, ScoreBar } from '@/components/reasons';
import { getDict } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { getAiHealth } from '@/server/ai-service';
import { requirePageUser } from '@/server/auth';
import { quotaFor } from '@/server/generation';
import { GenerateButton } from '@/components/generate-button';

export const metadata = { title: 'Validation result' };

const SUB_KEYS = ['sharpness', 'exposure', 'contrast', 'backgroundSimplicity', 'completeness'] as const;

export default async function ValidationResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/studio/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const { t } = await getDict();
  const supabase = await createClient();
  // RLS: returns nothing for products the user does not own -> 404 (no existence leak)
  const { data: product } = await supabase
    .from('products')
    .select('id, name, marketplace, original_product_url, original_image_key, user_size_cm, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!product) notFound();
  const { data: v } = await supabase
    .from('image_validations')
    .select('*')
    .eq('product_id', id)
    .order('validated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const signed = product.original_image_key
    ? (await supabase.storage.from('uploads').createSignedUrl(product.original_image_key, 600)).data?.signedUrl
    : null;
  const health = v?.is_valid ? await getAiHealth() : null;
  const generationAvailable = Boolean(health?.reconstructionAvailable);
  const { data: lastJob } = await supabase
    .from('generation_jobs')
    .select('id, status')
    .eq('product_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: readyModel } = await supabase
    .from('generated_models')
    .select('id')
    .eq('product_id', id)
    .eq('status', 'ready')
    .limit(1)
    .maybeSingle();
  const activeJobId = lastJob && ['queued', 'running'].includes(lastJob.status) ? lastJob.id : null;
  const quota = v?.is_valid ? await quotaFor(user.id) : { remaining: 0, limit: 0 };
  const reasons = parseReasons(v?.rejection_reasons);
  const sub = (v?.sub_scores ?? {}) as Partial<Record<(typeof SUB_KEYS)[number], number>>;
  const R = t.result;

  return (
    <div className="mx-auto max-w-4xl">
      <p className="eyebrow">{R.title}</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">{product.name ?? t.history.untitled}</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
        <div className="flex min-h-64 items-center justify-center overflow-hidden card p-4">
          {signed ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img src={signed} alt={product.name ?? t.studio.fileLabel} className="max-h-96 w-auto rounded-lg object-contain" />
          ) : (
            <p className="text-sm text-ink-soft">{t.reasons.INVALID_FILE.title}</p>
          )}
        </div>
        <div className="space-y-6">
          <div className={`rounded-xl p-4 ${v?.is_valid ? 'bg-sage-soft' : 'bg-danger-soft'}`} role="status">
            <p className="font-display text-xl font-semibold">{v?.is_valid ? R.passed : R.failed}</p>
            <p className="mt-1 text-sm text-ink-soft">{R.savedInHistory}</p>
          </div>
          {v?.quality_score != null && (
            <div className="space-y-3 card p-5">
              <p className="flex items-baseline justify-between">
                <span className="font-medium">{R.score}</span>
                <span className="font-display text-3xl tabular-nums">{v.quality_score}</span>
              </p>
              {SUB_KEYS.filter((k) => typeof sub[k] === 'number').map((k) => (
                <ScoreBar key={k} label={R.sub[k]} value={sub[k]!} />
              ))}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {v?.object_count != null && (
              <div className="card p-4">
                <dt className="text-ink-soft">{R.objectCount}</dt>
                <dd className="mt-1 text-lg">{v.object_count}</dd>
              </div>
            )}
            {v?.detected_category && (
              <div className="card p-4">
                <dt className="text-ink-soft">{R.category}</dt>
                <dd className="mt-1 text-lg">
                  {v.detected_category}
                  {v.category_confidence != null && (
                    <span className="ml-1 text-sm text-ink-soft">
                      ({Math.round(v.category_confidence * 100)}% {R.confidence})
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
          {reasons.length > 0 && <ReasonList reasons={reasons} t={t} />}
          <div className="flex flex-wrap gap-3">
            {v?.is_valid ? (
              <>
                {readyModel && (
                  <Link href={`/model/${id}`} className="btn-primary">
                    {t.gen.openModel}
                  </Link>
                )}
                <GenerateButton
                  productId={id}
                  available={generationAvailable}
                  cpuMode={Boolean(health?.cpuMode)}
                  quota={quota}
                  activeJobId={activeJobId}
                  label={readyModel ? t.gen.regenerate : t.gen.start}
                  t={{ gen: t.gen, common: t.common }}
                />
              </>
            ) : (
              <Link href="/studio" className="btn-primary">
                {t.common.uploadDifferent}
              </Link>
            )}
            <Link href="/history" className="btn-secondary">
              {t.nav.history}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
