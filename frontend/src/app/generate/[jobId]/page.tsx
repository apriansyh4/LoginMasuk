import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getDict } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { getAiHealth } from '@/server/ai-service';
import { requirePageUser } from '@/server/auth';
import { JobProgress, type JobRow } from './job-progress';

export const metadata = { title: 'Membuat model 3D' };

export default async function GeneratePage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  await requirePageUser(`/generate/${jobId}`);
  if (!z.uuid().safeParse(jobId).success) notFound();
  const { t } = await getDict();
  const supabase = await createClient();
  const { data: job } = await supabase
    .from('generation_jobs')
    .select('id, product_id, status, current_stage, error_code, attempt_count, created_at, started_at, completed_at')
    .eq('id', jobId)
    .maybeSingle();
  if (!job) notFound(); // RLS: not the owner -> not found
  const { data: product } = await supabase.from('products').select('name').eq('id', job.product_id).maybeSingle();
  const health = await getAiHealth();
  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">{t.gen.title}</p>
      <h1 className="mt-2 page-title">{product?.name ?? t.history.untitled}</h1>
      <div className="mt-8">
        <JobProgress initial={job as JobRow} cpuMode={Boolean(health?.cpuMode)} t={{ gen: t.gen, common: t.common }} />
      </div>
    </div>
  );
}
