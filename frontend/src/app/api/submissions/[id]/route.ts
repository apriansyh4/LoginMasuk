import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireApiUser } from '@/server/auth';
import { assertSameOrigin, jsonError, route } from '@/server/http';
import { deleteSubmissionFiles } from '@/server/submissions';

const idSchema = z.uuid();

export const DELETE = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  await requireApiUser();
  const id = idSchema.parse((await ctx.params).id);
  const supabase = await createClient();
  // RLS: only the owner can see the row; anyone else gets 404 (no existence leak).
  const { data } = await supabase.from('products').select('id').eq('id', id).maybeSingle();
  if (!data) return jsonError(404, 'NOT_FOUND');
  await deleteSubmissionFiles(id);
  const { error, count } = await supabase.from('products').delete({ count: 'exact' }).eq('id', id);
  if (error || count !== 1) return jsonError(500, 'DELETE_FAILED');
  return new NextResponse(null, { status: 204 });
});
