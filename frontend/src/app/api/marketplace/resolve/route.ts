import { z } from 'zod';
import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { requireApiUser } from '@/server/auth';
import { assertSameOrigin, route } from '@/server/http';
import { resolveMarketplaceUrl } from '@/server/marketplace/resolve';
import { hitRateLimit } from '@/server/rate-limit';

const body = z.object({ url: z.string().min(1).max(2048) });

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireApiUser();
  await hitRateLimit('url_fetch', user.id, 3600, serverEnv().RATE_LIMIT_URL_PER_HOUR);
  const { url } = body.parse(await req.json());
  const result = await resolveMarketplaceUrl(url);
  return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: { 'cache-control': 'no-store' } });
});
