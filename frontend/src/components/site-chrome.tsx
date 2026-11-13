import Link from 'next/link';
import { getDict } from '@/lib/i18n/server';
import { getSessionUser } from '@/server/auth';

export async function SiteHeader() {
  const { t } = await getDict();
  const user = await getSessionUser().catch(() => null);
  return (
    <header className="relative z-10 border-b-2 border-ink bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2"
      >
        Langsung ke konten
      </a>
      <nav aria-label="Navigasi utama" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-extrabold text-ink">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-lg border-2 border-ink bg-kunyit text-[11px] font-extrabold"
          >
            AR
          </span>
          AR-LOKAL
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-1 text-sm">
          <Link className="btn-ghost" href="/about">
            {t.nav.about}
          </Link>
          {user ? (
            <>
              <Link className="btn-ghost" href="/studio">
                {t.nav.studio}
              </Link>
              <Link className="btn-ghost" href="/history">
                {t.nav.history}
              </Link>
              <Link className="btn-ghost" href="/account">
                {t.nav.account}
              </Link>
              {user.role === 'admin' && (
                <Link className="btn-ghost" href="/admin">
                  {t.nav.admin}
                </Link>
              )}
              <form action="/auth/signout" method="post">
                <button className="btn-ghost" type="submit">
                  {t.nav.logout}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link className="btn-ghost" href="/login">
                {t.nav.login}
              </Link>
              <Link className="btn-primary" href="/register">
                {t.nav.register}
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export async function SiteFooter() {
  const { t } = await getDict();
  return (
    <footer className="mt-24 bg-ink text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 text-sm md:flex-row md:items-center">
        <div>
          <p className="font-display text-lg font-extrabold">AR-LOKAL</p>
          <p className="mt-1 text-white/75">Foto produk UMKM jadi 3D dan AR.</p>
        </div>
        <nav aria-label="Navigasi bawah" className="flex flex-wrap gap-x-5 gap-y-2 md:ml-auto">
          <Link className="text-white/85 hover:text-kunyit" href="/about">
            {t.footer.about}
          </Link>
          <Link className="text-white/85 hover:text-kunyit" href="/privacy">
            {t.footer.privacy}
          </Link>
          <Link className="text-white/85 hover:text-kunyit" href="/ai-transparency">
            {t.footer.ai}
          </Link>
          <Link className="text-white/85 hover:text-kunyit" href="/credits">
            {t.footer.credits}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
