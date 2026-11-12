import { NextResponse } from 'next/server';
import { getAiHealth } from '@/server/ai-service';
import { requireApiUser } from '@/server/auth';
import { route } from '@/server/http';

/** AI availability for the Studio UI (no internal detail beyond what the UI needs). */
export const GET = route(async () => {
  await requireApiUser();
  const h = await getAiHealth();
  return NextResponse.json(
    {
      reachable: Boolean(h),
      validationAvailable: h?.validationAvailable ?? false,
      generationAvailable: Boolean(h?.reconstructionAvailable && h?.gpuAvailable),
      gpuAvailable: h?.gpuAvailable ?? false,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
});
