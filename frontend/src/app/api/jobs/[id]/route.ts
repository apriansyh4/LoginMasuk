import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireApiUser } from '@/server/auth';
import { jsonError, route } from '@/server/http';

/** Polling fallback when Realtime is not connected. RLS limits it to the owner. */
export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireApiUser();
  const id = z.uuid().parse((await ctx.params).id);
  const supabase = await createClient();
  const { data } = await supabase
    .from('generation_jobs')
    .select(
      'id, product_id, status, current_stage, error_code, error_message, attempt_count, created_at, started_at, completed_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (!data) return jsonError(404, 'NOT_FOUND');
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
});
