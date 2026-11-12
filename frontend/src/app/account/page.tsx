import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDict } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { requirePageUser } from '@/server/auth';

export const metadata = { title: 'Account' };

async function updateName(form: FormData) {
  'use server';
  const user = await requirePageUser('/account');
  const name = z.string().trim().min(1).max(80).safeParse(form.get('displayName'));
  if (!name.success) return;
  const supabase = await createClient();
  // RLS + column grant: only display_name of the caller's own row is writable
  await supabase.from('profiles').update({ display_name: name.data }).eq('id', user.id);
  revalidatePath('/account');
}

export default async function AccountPage() {
  const user = await requirePageUser('/account');
  const { lang, t } = await getDict();
  const m4 =
    lang === 'id'
      ? 'Ekspor data dan hapus akun akan tersedia di Milestone 4. Sampai saat itu Anda dapat menghapus setiap kiriman (beserta filenya) dari Riwayat.'
      : 'Data export and account deletion arrive in Milestone 4. Until then you can delete each submission (and its files) from History.';
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-display text-4xl font-semibold">{t.nav.account}</h1>
      <div className="card p-6">
        <p className="text-sm text-ink-soft">{t.auth.email}</p>
        <p className="mt-1">{user.email}</p>
      </div>
      <form action={updateName} className="space-y-4 card p-6">
        <label className="block">
          <span className="label">{t.auth.displayName}</span>
          <input name="displayName" defaultValue={user.displayName ?? ''} maxLength={80} required className="field" />
        </label>
        <button className="btn-primary" type="submit">
          {lang === 'id' ? 'Simpan' : 'Save'}
        </button>
      </form>
      <div className="card p-6 text-sm">
        <a className="text-indigo underline" href="/forgot-password">
          {t.auth.resetTitle}
        </a>
        <p className="mt-4 text-ink-soft">{m4}</p>
      </div>
    </div>
  );
}
