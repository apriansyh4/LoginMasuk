import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/server/auth';
import { assertSameOrigin, jsonError, route } from '@/server/http';
import { ResizeError, resizeModel, sizeSchema } from '@/server/model-size';
import { hitRateLimit } from '@/server/rate-limit';

/** Set the real size of a ready model; the GLB is rescaled in place (no regeneration). */
export const POST = route(async (req: Request, ctx: { params: Promise<{ productId: string }> }) => {
  assertSameOrigin(req);
  const user = await requireApiUser();
  await hitRateLimit('model_resize', user.id, 3600, 60);
  const productId = z.uuid().parse((await ctx.params).productId);
  const input = sizeSchema.parse(await req.json().catch(() => ({})));
  try {
    const { bboxM } = await resizeModel(productId, input);
    return NextResponse.json({ ok: true, bboxM }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ResizeError) return jsonError(e.status, e.code);
    throw e;
  }
});
