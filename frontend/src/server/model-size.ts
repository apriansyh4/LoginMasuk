import 'server-only';
import { z } from 'zod';
import type { Json } from '@/lib/database.types';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { scaleGlb } from '@/server/glb-scale';

export const sizeSchema = z.object({
  axis: z.enum(['height', 'width', 'depth']),
  cm: z.number().min(0.5).max(500),
});
export type SizeInput = z.infer<typeof sizeSchema>;

const AXIS_INDEX = { width: 0, height: 1, depth: 2 } as const; // glTF: X width, Y up, Z depth

export class ResizeError extends Error {
  constructor(
    public readonly status: 404 | 409 | 500,
    public readonly code: string,
  ) {
    super(code);
  }
}

/** Scale factor that makes the chosen side equal to the given size. */
export function factorFor(bboxM: number[], input: SizeInput): number {
  const current = bboxM[AXIS_INDEX[input.axis]];
  if (bboxM.length !== 3 || !current || !Number.isFinite(current) || current <= 0) throw new ResizeError(409, 'NO_SIZE_INFO');
  const f = input.cm / 100 / current;
  if (!Number.isFinite(f) || f < 0.001 || f > 1000) throw new ResizeError(409, 'BAD_SCALE');
  return f;
}

/**
 * Set the real size of the latest ready model of a product the caller owns.
 * Ownership is checked through RLS (the caller's own client); the writes use the
 * service client because these columns are server-only.
 */
export async function resizeModel(productId: string, input: SizeInput): Promise<{ bboxM: number[] }> {
  const supabase = await createClient();
  const { data: product } = await supabase.from('products').select('id').eq('id', productId).maybeSingle();
  if (!product) throw new ResizeError(404, 'NOT_FOUND');
  const { data: model } = await supabase
    .from('generated_models')
    .select('id, status, glb_key, engine_info')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!model || model.status !== 'ready') throw new ResizeError(404, 'NO_MODEL');

  const info = (model.engine_info ?? {}) as Record<string, unknown>;
  const bbox = Array.isArray(info.bboxM) ? (info.bboxM as number[]) : [];
  const factor = factorFor(bbox, input);

  const db = createServiceClient();
  const file = await db.storage.from('models').download(model.glb_key);
  if (file.error || !file.data) throw new ResizeError(500, 'STORAGE_FAILED');
  const scaled = scaleGlb(Buffer.from(await file.data.arrayBuffer()), factor);
  const up = await db.storage.from('models').upload(model.glb_key, scaled, { contentType: 'model/gltf-binary', upsert: true });
  if (up.error) throw new ResizeError(500, 'STORAGE_FAILED');

  const bboxM = bbox.map((v) => Math.round(v * factor * 10000) / 10000);
  const { error: e1 } = await db
    .from('generated_models')
    .update({ engine_info: { ...info, bboxM, sizeSource: 'user' } as NonNullable<Json> })
    .eq('id', model.id);
  const { error: e2 } = await db
    .from('products')
    .update({ user_size_cm: { [input.axis]: input.cm } as Json })
    .eq('id', productId);
  if (e1 || e2) throw new ResizeError(500, 'UPDATE_FAILED');
  return { bboxM };
}
