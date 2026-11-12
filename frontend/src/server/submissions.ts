import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Json } from '@/lib/database.types';
import { serverEnv } from '@/lib/env';
import { createServiceClient } from '@/lib/supabase/server';
import { AiServiceError, validateImage, type ValidationResult } from '@/server/ai-service';
import { ImageRejected, sanitizeImage } from '@/server/images';
import { fetchListingImage, resolveMarketplaceUrl } from '@/server/marketplace/resolve';

const sizeSchema = z
  .object({
    height: z.coerce.number().positive().max(500).optional(),
    width: z.coerce.number().positive().max(500).optional(),
    depth: z.coerce.number().positive().max(500).optional(),
  })
  .refine((s) => s.height || s.width || s.depth, 'at least one dimension')
  .optional();

export const submissionFields = z.object({
  source: z.enum(['upload', 'marketplace']),
  name: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || undefined),
  productUrl: z.string().max(2048).optional(),
  imageUrl: z.string().max(2048).optional(),
  rightsConfirmed: z.literal('true'),
  size: sizeSchema,
});
export type SubmissionFields = z.infer<typeof submissionFields>;

export type SubmissionOutcome =
  | { ok: true; productId: string; validation: ValidationResult | null; serverRejection?: string }
  | { ok: false; status: number; error: string };

/**
 * Create a submission: sanitize image -> store privately -> validate with the
 * ai-service -> record product + validation (rejected attempts included).
 * All writes use the service role AFTER the caller has been authenticated.
 */
export async function createSubmission(
  userId: string,
  fields: SubmissionFields,
  file: Buffer | null,
): Promise<SubmissionOutcome> {
  const db = createServiceClient();
  let marketplace: 'none' | 'shopee' | 'tokopedia' = 'none';
  let originalUrl: string | null = null;
  let canonicalUrl: string | null = null;
  let name = fields.name ?? null;
  let price: number | null = null;
  let currency: string | null = null;
  let priceAt: string | null = null;
  let raw: Buffer;

  if (fields.source === 'marketplace') {
    if (!fields.productUrl) return { ok: false, status: 400, error: 'PRODUCT_URL_REQUIRED' };
    const resolved = await resolveMarketplaceUrl(fields.productUrl);
    if (!resolved.ok) return { ok: false, status: 400, error: resolved.code };
    marketplace = resolved.marketplace;
    originalUrl = resolved.originalUrl; // stored verbatim for the buy button
    canonicalUrl = resolved.canonicalUrl;
    name ??= resolved.metadata?.title ?? null;
    if (resolved.metadata?.price != null && resolved.metadata.currency) {
      price = resolved.metadata.price;
      currency = resolved.metadata.currency;
      priceAt = resolved.retrievedAt;
    }
    if (file)
      raw = file; // listing unreadable -> user uploads, original URL kept
    else {
      if (!fields.imageUrl) return { ok: false, status: 400, error: 'IMAGE_REQUIRED' };
      try {
        raw = await fetchListingImage(resolved, fields.imageUrl);
      } catch {
        return { ok: false, status: 422, error: 'LISTING_IMAGE_UNAVAILABLE' };
      }
    }
  } else {
    if (!file) return { ok: false, status: 400, error: 'IMAGE_REQUIRED' };
    raw = file;
  }

  // 1. content-based check + EXIF orientation + metadata strip
  let image: Awaited<ReturnType<typeof sanitizeImage>> | null = null;
  let serverRejection: 'INVALID_FILE' | 'FILE_TOO_LARGE' | null = null;
  try {
    image = await sanitizeImage(raw);
  } catch (e) {
    if (e instanceof ImageRejected) serverRejection = e.code;
    else throw e;
  }

  // 2. validate before persisting anything so an outage leaves no half-made rows
  let validation: ValidationResult | null = null;
  if (image) {
    try {
      validation = await validateImage(image.data);
    } catch (e) {
      if (e instanceof AiServiceError) {
        return { ok: false, status: 503, error: e.code };
      }
      throw e;
    }
  }

  // 3. store image (random key under the user's folder; never user-controlled)
  const imageKey = image ? `${userId}/${randomUUID()}.${image.kind === 'jpeg' ? 'jpg' : image.kind}` : null;
  if (image && imageKey) {
    const up = await db.storage.from('uploads').upload(imageKey, image.data, { contentType: image.contentType, upsert: false });
    if (up.error) return { ok: false, status: 500, error: 'STORAGE_FAILED' };
    if (validation?.isValid && validation.maskPngBase64) {
      await db.storage
        .from('uploads')
        .upload(`${imageKey}.mask.png`, Buffer.from(validation.maskPngBase64, 'base64'), { contentType: 'image/png' });
    }
  }

  const retainUntil = new Date(Date.now() + serverEnv().RETENTION_DAYS * 86_400_000).toISOString();
  const { data: product, error: pErr } = await db
    .from('products')
    .insert({
      user_id: userId,
      name,
      marketplace,
      original_product_url: originalUrl,
      canonical_url: canonicalUrl,
      source_price: price,
      price_currency: currency,
      price_retrieved_at: priceAt,
      original_image_key: imageKey,
      user_size_cm: (fields.size ?? null) as Json,
      rights_confirmed: true,
      category: validation?.detectedCategory ?? null,
      retain_until: retainUntil,
    })
    .select('id')
    .single();
  if (pErr || !product) {
    if (imageKey) await db.storage.from('uploads').remove([imageKey, `${imageKey}.mask.png`]);
    return { ok: false, status: 500, error: 'DB_FAILED' };
  }

  const v = validation;
  const reasons = v
    ? v.rejectionReasons.map((r) => ({ code: r.code, message: r.message, detail: r.detail ?? null }))
    : [{ code: 'INVALID_FILE', message: 'This file is not a supported image.', detail: { reason: serverRejection } }];
  const { error: vErr } = await db.from('image_validations').insert({
    product_id: product.id,
    user_id: userId,
    is_valid: v?.isValid ?? false,
    object_count: v?.objectCount ?? null,
    contains_human: v?.containsHuman ?? null,
    contains_other_objects: v?.containsOtherObjects ?? null,
    quality_score: v?.qualityScore ?? null,
    sub_scores: (v?.subScores ?? {}) as { [k: string]: Json },
    detected_category: v?.detectedCategory ?? null,
    category_confidence: v?.categoryConfidence ?? null,
    rejection_reasons: (v?.isValid ? [] : reasons) as Json[],
    config_version: v?.configVersion ?? 'server-precheck',
  });
  if (vErr) return { ok: false, status: 500, error: 'DB_FAILED' };
  return { ok: true, productId: product.id, validation, ...(serverRejection ? { serverRejection } : {}) };
}

/** Delete a product and every stored file belonging to it. Caller must own it (checked via RLS read). */
export async function deleteSubmissionFiles(productId: string): Promise<void> {
  const db = createServiceClient();
  const { data: p } = await db.from('products').select('original_image_key').eq('id', productId).maybeSingle();
  const { data: models } = await db.from('generated_models').select('glb_key, usdz_key').eq('product_id', productId);
  const uploads = p?.original_image_key ? [p.original_image_key, `${p.original_image_key}.mask.png`] : [];
  const modelKeys = (models ?? []).flatMap((m) => [m.glb_key, m.usdz_key].filter((k): k is string => Boolean(k)));
  if (uploads.length) await db.storage.from('uploads').remove(uploads);
  if (modelKeys.length) await db.storage.from('models').remove(modelKeys);
}
