import { NextResponse } from 'next/server';
import { requireApiUser } from '@/server/auth';
import { quotaFor } from '@/server/generation';
import { route } from '@/server/http';

export const GET = route(async () => {
  const user = await requireApiUser();
  return NextResponse.json(await quotaFor(user.id), { headers: { 'cache-control': 'no-store' } });
});
