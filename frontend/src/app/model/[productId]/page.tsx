import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ModelViewer } from '@/components/model-viewer';
import { SizeForm } from '@/components/size-form';
import { getDict } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/server/auth';

export const metadata = { title: 'Model 3D' };

type EngineInfo = { cpu_mode?: boolean; device?: string; sizeSource?: string; bboxM?: number[] };

export default async function ModelPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  await requirePageUser(`/model/${productId}`);
  if (!z.uuid().safeParse(productId).success) notFound();
  const { t } = await getDict();
  const M = t.model;
  const supabase = await createClient();
  const { data: product } = await supabase
    .from('products')
    .select('id, name, category, marketplace, original_product_url, user_size_cm')
    .eq('id', productId)
    .maybeSingle();
  if (!product) notFound();
  const { data: model } = await supabase
    .from('generated_models')
    .select('id, status, glb_key, quality_status, quality_notes, texture_mode, face_count, duration_ms, engine_info, created_at')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!model || model.status !== 'ready') {
    return (
      <div className="mx-auto max-w-lg card p-8">
        <h1 className="font-display text-2xl font-extrabold">{product.name ?? t.history.untitled}</h1>
        <p className="mt-4 text-ink-soft">{model?.status === 'disabled' ? M.disabled : M.none}</p>
        <Link href={`/studio/${productId}`} className="mt-6 btn-secondary">
          {t.gen.backToResult}
        </Link>
      </div>
    );
  }

  // Signed URL must outlive a viewing session (brief: >= 1 hour).
  const { data: signed } = await supabase.storage.from('models').createSignedUrl(model.glb_key, 3600);
  const info = (model.engine_info ?? {}) as EngineInfo;
  const notes = (Array.isArray(model.quality_notes) ? model.quality_notes : []) as string[];
  const bbox = info.bboxM ?? [];
  const sizeText =
    bbox.length === 3
      ? `${(bbox[0]! * 100).toFixed(1)} × ${(bbox[1]! * 100).toFixed(1)} × ${(bbox[2]! * 100).toFixed(1)} cm`
      : '—';
  const userSize = info.sizeSource === 'user';
  const market = product.marketplace === 'shopee' ? 'Shopee' : product.marketplace === 'tokopedia' ? 'Tokopedia' : null;

  return (
    <div>
      <p className="eyebrow">{M.title}</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold">{product.name ?? t.history.untitled}</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
        <div>
          {signed?.signedUrl ? (
            <ModelViewer
              src={signed.signedUrl}
              alt={product.name ?? M.title}
              loadingText={M.viewerLoading}
              errorText={M.viewerError}
              arTexts={M.ar}
              vertexColours={model.texture_mode === 'vertex_color'}
            />
          ) : (
            <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">
              {M.viewerError}
            </p>
          )}
        </div>
        <aside className="space-y-4">
          <p className="inline-block rounded-full bg-indigo px-3 py-1 text-xs font-semibold tracking-wide text-white">
            {t.common.aiLabel}
          </p>
          <div
            className={`rounded-xl p-4 ${model.quality_status === 'good' ? 'bg-sage-soft' : model.quality_status === 'fair' ? 'bg-warn-soft' : 'bg-danger-soft'}`}
          >
            <p className="font-medium">{M.quality[model.quality_status as 'good' | 'fair' | 'poor']}</p>
            {model.quality_status !== 'good' && <p className="mt-1 text-sm">{M.qualityWarning}</p>}
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
              {notes.map((n) => (
                <li key={n}>{M.notes[n] ?? n}</li>
              ))}
            </ul>
          </div>
          <SizeForm productId={productId} bboxM={bbox} t={M.resize} />
          <dl className="grid grid-cols-2 gap-3 card p-4 text-sm">
            <dt className="text-ink-soft">{M.size}</dt>
            <dd>
              {sizeText}
              <span className="block text-xs text-ink-soft">{userSize ? M.sizeUser : t.common.approxSize}</span>
            </dd>
            <dt className="text-ink-soft">{t.result.category}</dt>
            <dd>{product.category ?? '—'}</dd>
            <dt className="text-ink-soft">{M.texture}</dt>
            <dd>{M.textureModes[model.texture_mode] ?? model.texture_mode}</dd>
            <dt className="text-ink-soft">{M.faces}</dt>
            <dd className="tabular-nums">{model.face_count?.toLocaleString('id-ID') ?? '—'}</dd>
            <dt className="text-ink-soft">{M.duration}</dt>
            <dd className="tabular-nums">{model.duration_ms != null ? `${(model.duration_ms / 1000).toFixed(1)} s` : '—'}</dd>
            <dt className="text-ink-soft">{M.device}</dt>
            <dd>{info.cpu_mode ? 'CPU' : 'GPU'}</dd>
          </dl>
          <div className="flex flex-wrap gap-3">
            {signed?.signedUrl && (
              <a href={signed.signedUrl} download className="btn-secondary">
                {M.download}
              </a>
            )}
            {product.original_product_url && market && (
              <a href={product.original_product_url} target="_blank" rel="noopener noreferrer" className="btn-primary">
                {M.buyOn.replace('{m}', market)}
              </a>
            )}
          </div>
          <p className="text-xs text-ink-soft">{t.common.notAffiliated}</p>
        </aside>
      </div>
    </div>
  );
}
