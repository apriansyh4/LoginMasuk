import { createServiceClient } from '@/lib/supabase/server';
import { getAiHealth } from '@/server/ai-service';
import { requirePageAdmin } from '@/server/auth';

export const metadata = { title: 'Admin' };

/** M1: authorization + real counts. Full dashboard/moderation is Milestone 4. */
export default async function AdminPage() {
  await requirePageAdmin('/admin');
  const db = createServiceClient(); // used only after the admin check above
  const [users, products, rejected, health] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('products').select('id', { count: 'exact', head: true }),
    db.from('image_validations').select('id', { count: 'exact', head: true }).eq('is_valid', false),
    getAiHealth(),
  ]);
  const stats: [string, string | number][] = [
    ['Pengguna', users.count ?? '—'],
    ['Kiriman', products.count ?? '—'],
    ['Validasi ditolak', rejected.count ?? '—'],
    [
      'Layanan validasi',
      health ? (health.validationAvailable ? 'tersedia' : `kurang: ${health.validationMissing.join(', ')}`) : 'tidak terjangkau',
    ],
    ['GPU', health?.gpuAvailable ? (health.gpuName ?? 'ya') : 'tidak tersedia'],
  ];
  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">Admin</h1>
      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="card p-5">
            <dt className="text-sm text-ink-soft">{k}</dt>
            <dd className="mt-1 font-display text-2xl">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm text-ink-soft">Moderasi, pengelolaan pengguna, dan log audit akan segera hadir.</p>
    </div>
  );
}
