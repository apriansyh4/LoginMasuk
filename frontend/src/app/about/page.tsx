import Link from 'next/link';
import { getDict } from '@/lib/i18n/server';

export const metadata = { title: 'Cara kerja' };

export default async function AboutPage() {
  const { t } = await getDict();
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="font-display text-4xl font-extrabold">{t.landing.howTitle}</h1>
      <ol className="mt-8 space-y-6">
        {t.landing.how.map(([h, p], i) => (
          <li key={h} className="card p-6">
            <p className="eyebrow">{i + 1}</p>
            <h2 className="mt-1 font-display text-xl font-extrabold">{h}</h2>
            <p className="mt-2 text-ink-soft">{p}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-ink-soft">{t.landing.honesty}</p>
      <Link href="/ai-transparency" className="mt-6 btn-secondary">
        {t.footer.ai}
      </Link>
    </article>
  );
}
