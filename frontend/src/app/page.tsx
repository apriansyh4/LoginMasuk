import Link from 'next/link';
import { getDict } from '@/lib/i18n/server';
import { getSessionUser } from '@/server/auth';

export default async function Landing() {
  const { t } = await getDict();
  const user = await getSessionUser().catch(() => null);
  const ctaHref = user ? '/studio' : '/register?next=/studio';
  const L = t.landing;
  return (
    <div className="space-y-20">
      {/* Hero: a turmeric market band with a kawung batik texture; the price-tag card shows the real flow. */}
      <section className="relative -mx-5 -mt-10 overflow-hidden border-b-2 border-ink bg-kunyit md:mx-[calc(50%-50vw)]">
        <div className="absolute inset-0 bg-kawung" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 md:grid-cols-[1.15fr_0.85fr] md:py-20">
          <div>
            <p className="inline-flex rounded-full border-2 border-ink bg-white px-3 py-1 text-sm font-bold">
              Untuk UMKM fashion dan kerajinan
            </p>
            <h1 className="mt-6 font-display text-4xl leading-[1.08] font-extrabold tracking-[-0.015em] text-balance text-ink md:text-[3.4rem]">
              {L.headline}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink">{L.subtitle}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={ctaHref}
                className="btn min-h-13 border-2 border-ink bg-ink px-7 text-base text-kunyit shadow-[4px_4px_0_white] hover:bg-nila"
              >
                {L.cta}
              </Link>
              <Link href="/about" className="btn-secondary min-h-13 px-6 text-base">
                {L.howTitle}
              </Link>
            </div>
          </div>

          <div className="relative md:rotate-[-1.5deg]">
            <div className="relative stiker p-7 pl-12">
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-4 size-4 -translate-y-1/2 rounded-full border-2 border-ink bg-kunyit"
              />
              <p className="text-sm font-bold text-kunyit-dark">{L.howTitle}</p>
              <ol className="mt-4 space-y-4">
                {L.how.map(([title, body], i) => (
                  <li key={title} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-nila text-sm font-extrabold text-white"
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-bold">{title}</p>
                      <p className="text-sm leading-relaxed text-ink-soft">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="benefits">
        <h2 id="benefits" className="font-display text-3xl font-extrabold">
          {L.benefitsTitle}
        </h2>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {L.benefits.map(([title, body]) => (
            <li key={title} className="border-t-4 border-kunyit pt-5">
              <p className="text-lg font-extrabold">{title}</p>
              <p className="mt-2 leading-relaxed text-ink-soft">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="categories" className="rounded-[var(--radius-card)] bg-cream p-8 md:p-10">
        <h2 id="categories" className="font-display text-2xl font-extrabold">
          {L.categoriesTitle}
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {[L.categoriesFashion, L.categoriesCraft].map((line) => {
            const [group, items] = line.split(': ');
            return (
              <div key={group}>
                <p className="font-bold">{group}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {items!.split(', ').map((item) => (
                    <li key={item} className="rounded-full border border-sand bg-white px-3.5 py-1.5 text-sm">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-8 max-w-2xl text-sm text-ink-soft">{L.honesty}</p>
      </section>
    </div>
  );
}
