import { getDict } from '@/lib/i18n/server';

export default async function Suspended() {
  const { t } = await getDict();
  return (
    <div className="mx-auto max-w-lg card p-8">
      <h1 className="font-display text-3xl font-semibold">{t.auth.suspendedTitle}</h1>
      <p className="mt-4 text-ink-soft">{t.auth.suspended}</p>
    </div>
  );
}
