import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/server/auth';
import { startGeneration } from '@/server/generation';
import { assertSameOrigin, jsonError, route } from '@/server/http';
import { hitRateLimit } from '@/server/rate-limit';

const body = z.object({ productId: z.uuid() });

/** Start (or re-start) 3D generation for a validated product. */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireApiUser();
  await hitRateLimit('generate_burst', user.id, 60, 5); // click-spam guard; the daily quota is separate
  const { productId } = body.parse(await req.json());
  const out = await startGeneration(user.id, productId);
  if (!out.ok) return jsonError(out.status, out.error, out.activeJobId ? { jobId: out.activeJobId } : {});
  return NextResponse.json({ jobId: out.jobId }, { status: 201, headers: { 'cache-control': 'no-store' } });
});
