import Link from 'next/link';
import { BagArt, BagWireframe, ShoeArt, Sparkle, VaseArt } from '@/components/illustrations';
import { getDict } from '@/lib/i18n/server';
import { getSessionUser } from '@/server/auth';

const STEP_SHADOW = ['shadow-[8px_8px_0_var(--color-lilac)]', 'shadow-[8px_8px_0_var(--color-toska)]', 'shadow-[8px_8px_0_var(--color-jambu)]'];
const STEP_TAG = ['bg-lilac', 'bg-toska', 'bg-jambu'];
const SHOWCASE = [
  { card: 'bg-kunyit -rotate-[1.5deg]', glow: 'bg-[#ffd877]', tag: 'text-kunyit rotate-6' },
  { card: 'bg-jambu rotate-1 md:translate-y-5', glow: 'bg-[#ff9da9]', tag: 'text-jambu -rotate-6' },
  { card: 'bg-toska -rotate-1', glow: 'bg-[#6fe0d2]', tag: 'text-toska rotate-3' },
];
const BENEFIT_ICON = ['bg-kunyit', 'bg-jambu', 'bg-toska', 'bg-ink text-kunyit'];

function Arrow() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

const ICONS = [
  <path key="a" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8" />,
  <path key="b" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />,
  <path key="c" d="M4 7l8-4 8 4v10l-8 4-8-4zM12 21V11M20 7l-8 4-8-4" />,
  <path key="d" d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5" />,
];

export default async function Landing() {
  const { t } = await getDict();
  const user = await getSessionUser().catch(() => null);
  const ctaHref = user ? '/studio' : '/register?next=/studio';
  const L = t.landing;
  const categories = [L.categoriesFashion, L.categoriesCraft].flatMap((line) => line.split(': ')[1]!.split(', '));
  const [h1a, h1mark, h1b] = L.headline;

  return (
    <div className="-mt-10 -mb-24 mx-[calc(50%-50vw)] overflow-x-clip">
      {/* Hero: night-market stall with turmeric spotlight and floating price-tag stickers. */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div aria-hidden="true" className="absolute top-8 right-16 hidden size-[34rem] rounded-full bg-kunyit lg:block" />
        <div aria-hidden="true" className="absolute bottom-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-kunyit lg:hidden" />
        <div aria-hidden="true" className="absolute top-[26rem] right-[22rem] hidden size-52 rounded-full bg-jambu lg:block" />
        <div aria-hidden="true" className="absolute top-[30rem] right-4 hidden size-32 rotate-[18deg] rounded-[2rem] bg-toska lg:block" />
        <Sparkle className="absolute top-14 right-[38rem] hidden size-24 text-lilac lg:block" />

        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-12 px-5 pt-14 pb-24 lg:flex-row lg:pt-16">
          <div className="min-w-0 flex-1">
            <p className="inline-flex -rotate-2 items-center gap-2 rounded-full bg-toska px-4 py-2 text-sm font-extrabold text-ink">
              {L.kicker}
            </p>
            <h1 className="mt-6 font-display text-[3.2rem] leading-[0.95] font-extrabold tracking-[-0.035em] md:text-[5rem]">
              {h1a}{' '}
              <span className="inline-block -rotate-2 rounded-2xl bg-jambu px-3 pb-1.5 text-ink">{h1mark}</span>{' '}
              {h1b}
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-lavender">{L.subtitle}</p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link href={ctaHref} className="btn min-h-14 bg-kunyit px-7 text-base font-extrabold text-ink shadow-[5px_5px_0_var(--color-jambu)] hover:-translate-y-0.5">
                {L.cta}
                <Arrow />
              </Link>
              <Link href="/about" className="btn min-h-14 bg-paper px-6 text-base font-extrabold text-ink shadow-[5px_5px_0_var(--color-toska)] hover:-translate-y-0.5">
                {L.howTitle}
              </Link>
            </div>
          </div>

          {/* Phone showing a product placed in AR. */}
          <div className="relative h-[37rem] w-full max-w-[28rem] shrink-0">
            <div className="absolute top-2 left-1/2 h-[35rem] w-[17.5rem] -translate-x-1/2 animate-ngambang overflow-hidden rounded-[3rem] border-[10px] border-[#0b0a1f] bg-[#0b0a1f] shadow-[0_30px_60px_rgb(11_10_31/0.6)]">
              <div className="absolute inset-0 bg-[linear-gradient(180deg,#5b4f96_0%,#6e5fa8_46%,#a87b55_46%,#bd8e63_100%)]" />
              <div className="absolute inset-x-3.5 top-4 flex justify-between text-xs font-bold">
                <span className="rounded-full bg-[#0b0a1f]/75 px-3 py-1.5">Mode AR</span>
                <span className="rounded-full bg-kunyit px-3 py-1.5 font-extrabold text-ink">1:1</span>
              </div>
              <div aria-hidden="true" className="absolute top-[23.5rem] left-1/2 h-12 w-48 -translate-x-1/2 rounded-[50%] border-2 border-dashed border-kunyit" />
              <BagArt className="absolute top-[12.5rem] left-1/2 w-44 -translate-x-1/2" label="Tas anyaman yang ditaruh di meja lewat AR" />
              <p className="absolute inset-x-3.5 bottom-4 rounded-2xl bg-kunyit p-3.5 text-center text-sm font-extrabold text-ink">Taruh di sini</p>
            </div>
            <p className="absolute top-24 left-0 -rotate-[10deg] rounded-2xl bg-jambu px-4 py-2.5 font-display text-xl font-extrabold text-ink shadow-[4px_4px_0_#0b0a1f]">
              Ukuran asli!
            </p>
            <div className="absolute top-60 right-0 rotate-6 rounded-2xl bg-paper px-4 py-3 text-ink shadow-[4px_4px_0_#0b0a1f]">
              <p className="text-xs font-bold text-ink-soft">Tinggi</p>
              <p className="font-display text-3xl leading-none font-extrabold">28 cm</p>
            </div>
            <div className="absolute bottom-8 left-1 flex -rotate-[4deg] items-center gap-2.5 rounded-2xl border-2 border-toska bg-ink py-2.5 pr-4 pl-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-toska">
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14132e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L19 7" />
                </svg>
              </span>
              <span>
                <span className="block text-sm font-extrabold">Foto lolos cek AI</span>
                <span className="block text-xs text-lavender">model jadi kurang dari 1 menit</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Category ribbon. */}
      <section aria-label={L.categoriesTitle} className="relative z-[1] -mx-5 -mt-5 -rotate-[1.5deg] bg-kunyit text-ink shadow-[0_8px_0_var(--color-jambu)]">
        <ul className="flex items-center justify-center gap-5 overflow-hidden px-8 py-5 font-display text-2xl font-extrabold whitespace-nowrap">
          {categories.slice(0, 11).map((c, i) => (
            <li key={c} className="flex items-center gap-5">
              {i > 0 && <Sparkle className="size-4" />}
              <span className="inline-block first-letter:uppercase">{c}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Photo → 3D → AR. */}
      <section id="cara" className="bg-paper pt-10 text-ink">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <h2 className="text-center font-display text-4xl leading-none font-extrabold tracking-[-0.03em] md:text-6xl">{L.stepsTitle}</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg leading-relaxed text-ink-soft">{L.stepsLead}</p>
          <ol className="mt-14 grid gap-7 md:grid-cols-3">
            {L.steps.map(([title, body], i) => (
              <li key={title} className={`overflow-hidden rounded-[2rem] border-[2.5px] border-ink bg-white ${STEP_SHADOW[i]}`}>
                <div className="relative flex h-64 items-center justify-center overflow-hidden">
                  {i === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-cream">
                      <div className="h-52 w-48 -rotate-[5deg] bg-white p-3 pb-9 shadow-[0_6px_18px_rgb(20_19_46/0.18)]">
                        <div className="flex size-full items-center justify-center bg-[#dcd7ea]">
                          <BagArt className="w-28" label="Foto tas" />
                        </div>
                      </div>
                    </div>
                  )}
                  {i === 1 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-ink">
                      <BagWireframe className="w-40" label="Kerangka 3D tas" />
                      <span className="absolute right-4 bottom-4 rounded-full bg-toska px-3 py-1.5 text-xs font-extrabold text-ink">bisa diputar 360°</span>
                    </div>
                  )}
                  {i === 2 && (
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffd36e_0%,#ffc23d_55%,#e0a12a_55%,#d49522_100%)]">
                      <div aria-hidden="true" className="absolute top-[12.2rem] left-1/2 h-10 w-44 -translate-x-1/2 rounded-[50%] border-2 border-dashed border-ink" />
                      <BagArt className="absolute top-14 left-1/2 w-36 -translate-x-1/2" body="#f6f5fb" rim="#dcd7ea" weave="#b9a6ff" label="Tas di meja lewat AR" />
                      <span className="absolute top-4 right-4 rounded-full bg-ink px-3 py-1.5 text-xs font-extrabold text-kunyit">28 cm</span>
                    </div>
                  )}
                </div>
                <div className="p-6 pb-7">
                  <span className={`inline-block rounded-full px-3 py-1.5 text-xs font-extrabold ${STEP_TAG[i]}`}>Langkah {i + 1}</span>
                  <h3 className="mt-3 font-display text-3xl font-extrabold">{title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-soft">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Showcase: colourful stall cards (illustrations). */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div aria-hidden="true" className="absolute top-28 -left-28 size-96 rounded-full bg-lilac/20" />
        <div className="relative mx-auto max-w-6xl px-5 py-24">
          <div className="flex flex-wrap items-end gap-5">
            <h2 className="max-w-xl flex-1 font-display text-4xl leading-none font-extrabold tracking-[-0.03em] md:text-6xl">{L.showcaseTitle}</h2>
            <p className="max-w-sm leading-relaxed text-lavender">{L.showcaseLead}</p>
          </div>
          <ul className="mt-14 grid gap-7 md:grid-cols-3">
            {L.showcase.map(([name, cat, size], i) => {
              const s = SHOWCASE[i]!;
              return (
                <li key={name} className={`overflow-hidden rounded-[2rem] text-ink ${s.card}`}>
                  <div className="relative h-72">
                    <div aria-hidden="true" className={`absolute top-10 left-1/2 size-56 -translate-x-1/2 rounded-full ${s.glow}`} />
                    {i === 0 && <BagArt className="absolute bottom-7 left-1/2 w-44 -translate-x-1/2" body="#b97a35" rim="#9c6428" weave="#8a5520" label={name} />}
                    {i === 1 && <VaseArt className="absolute bottom-7 left-1/2 w-32 -translate-x-1/2" label={name} />}
                    {i === 2 && <ShoeArt className="absolute bottom-12 left-1/2 w-56 -translate-x-1/2" label={name} />}
                    <span className={`absolute top-5 right-5 rounded-xl bg-ink px-3.5 py-2 text-sm font-extrabold ${s.tag}`}>{size}</span>
                  </div>
                  <div className="px-6 pb-7">
                    <h3 className="font-display text-2xl font-extrabold">{name}</h3>
                    <p className="mt-1 text-sm font-semibold">{cat}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Benefits. */}
      <section className="bg-lilac text-ink">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <h2 className="max-w-3xl font-display text-4xl leading-none font-extrabold tracking-[-0.03em] md:text-6xl">{L.benefitsTitle}</h2>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {L.benefits.map(([title, body], i) => (
              <li key={title} className="rounded-[1.75rem] border-[2.5px] border-ink bg-paper p-7">
                <span className={`flex size-13 items-center justify-center rounded-2xl ${BENEFIT_ICON[i]}`}>
                  <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    {ICONS[i]}
                  </svg>
                </span>
                <p className="mt-5 font-display text-2xl leading-tight font-extrabold">{title}</p>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing call to action. */}
      <section className="bg-ink px-5 py-24">
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-8 overflow-hidden rounded-[2.5rem] bg-kunyit p-10 text-ink shadow-[10px_10px_0_var(--color-jambu)] md:p-14">
          <Sparkle className="absolute -top-10 -right-8 size-40 text-ink/30" />
          <div className="relative min-w-0 flex-1 basis-[28rem]">
            <h2 className="font-display text-4xl leading-[0.98] font-extrabold tracking-[-0.03em] md:text-[3.5rem]">{L.ctaTitle}</h2>
            <p className="mt-4 text-lg leading-relaxed">{L.ctaBody}</p>
          </div>
          <Link href={ctaHref} className="btn relative min-h-15 bg-ink px-8 text-base font-extrabold text-kunyit hover:bg-nila-dark">
            {L.ctaButton}
            <Arrow />
          </Link>
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-lavender">{L.honesty}</p>
      </section>
    </div>
  );
}
