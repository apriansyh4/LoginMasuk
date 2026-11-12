import Link from 'next/link';
import { getDict } from '@/lib/i18n/server';
import { getSessionUser } from '@/server/auth';

export default async function Landing() {
  const { t } = await getDict();
  const user = await getSessionUser().catch(() => null);
  const ctaHref = user ? '/studio' : '/register?next=/studio';
  const L = t.landing;
  return (
    <div className="space-y-24">
      <section className="grid items-center gap-12 pt-6 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="eyebrow">UMKM · Fashion · Kriya</p>
          <h1 className="mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
            {L.headline}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">{L.subtitle}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={ctaHref} className="btn-primary px-7 text-base">
              {L.cta}
            </Link>
            <Link href="/about" className="btn-secondary">
              {t.nav.about}
            </Link>
          </div>
          <p className="mt-6 max-w-xl text-sm text-ink-soft">{L.honesty}</p>
        </div>
        {/* Hero: until the pipeline has produced a real example GLB (M2), show the
            process as an honest diagram, never a static image posing as 3D. */}
        <div className="relative overflow-hidden card p-8" aria-labelledby="hero-flow">
          <p id="hero-flow" className="eyebrow">
            {L.howTitle}
          </p>
          <ol className="mt-6 space-y-5">
            {L.how.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cream font-display text-terracotta"
                >
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-ink-soft">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="markets" className="grid gap-8 md:grid-cols-2">
        <div className="card p-8">
          <h2 id="markets" className="font-display text-2xl font-semibold">
            {L.marketsTitle}
          </h2>
          <ul className="mt-5 flex flex-wrap gap-3">
            {['Shopee Indonesia', 'Tokopedia'].map((m) => (
              <li key={m} className="rounded-full border border-sand px-4 py-2 text-sm">
                {m}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-soft">{t.common.notAffiliated}</p>
        </div>
        <div className="card p-8">
          <h2 className="font-display text-2xl font-semibold">{L.categoriesTitle}</h2>
          <ul className="mt-5 space-y-2 text-ink-soft">
            <li>{L.categoriesFashion}</li>
            <li>{L.categoriesCraft}</li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="examples">
        <h2 id="examples" className="font-display text-3xl font-semibold">
          {L.examplesTitle}
        </h2>
        <div className="mt-6 card p-8 text-ink-soft">{L.examplesEmpty}</div>
      </section>

      <section aria-labelledby="benefits">
        <h2 id="benefits" className="font-display text-3xl font-semibold">
          {L.benefitsTitle}
        </h2>
        <ul className="mt-6 grid gap-6 md:grid-cols-3">
          {L.benefits.map(([title, body]) => (
            <li key={title} className="card p-6">
              <p className="font-display text-lg font-semibold text-sogan">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
