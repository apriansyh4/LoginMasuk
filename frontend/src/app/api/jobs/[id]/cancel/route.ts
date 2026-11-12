import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/server/auth';
import { cancelJob } from '@/server/generation';
import { assertSameOrigin, jsonError, route } from '@/server/http';

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  await requireApiUser();
  const id = z.uuid().parse((await ctx.params).id);
  if (!(await cancelJob(id))) return jsonError(409, 'NOT_CANCELLABLE');
  return NextResponse.json({ cancelled: true }, { headers: { 'cache-control': 'no-store' } });
});
