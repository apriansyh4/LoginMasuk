import { NextResponse } from 'next/server';
import { getAiHealth } from '@/server/ai-service';
import { requireApiUser } from '@/server/auth';
import { route } from '@/server/http';

/** AI availability for the UI (no internal detail beyond what the UI needs). */
export const GET = route(async () => {
  await requireApiUser();
  const h = await getAiHealth();
  return NextResponse.json(
    {
      reachable: Boolean(h),
      validationAvailable: h?.validationAvailable ?? false,
      generationAvailable: h?.reconstructionAvailable ?? false,
      gpuAvailable: h?.gpuAvailable ?? false,
      cpuMode: h?.cpuMode ?? false,
      queueLength: h?.queueLength ?? 0,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
});
