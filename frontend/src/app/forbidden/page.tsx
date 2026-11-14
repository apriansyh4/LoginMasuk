import Link from 'next/link';
import { getDict } from '@/lib/i18n/server';

export default async function Forbidden() {
  const { t } = await getDict();
  return (
    <div className="mx-auto max-w-lg card p-8">
      <h1 className="page-title">403</h1>
      <p className="mt-4 text-ink-soft">{t.auth.forbidden}</p>
      <Link href="/" className="mt-6 btn-secondary">
        {t.common.back}
      </Link>
    </div>
  );
}
