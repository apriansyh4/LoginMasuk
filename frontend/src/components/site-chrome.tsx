import Link from 'next/link';
import { NavLink } from '@/components/nav-link';
import { getDict } from '@/lib/i18n/server';
import { getSessionUser } from '@/server/auth';

export async function SiteHeader() {
  const { t } = await getDict();
  const user = await getSessionUser().catch(() => null);
  return (
    <header className="relative z-10 bg-ink text-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2"
      >
        Langsung ke konten
      </a>
      <nav aria-label="Navigasi utama" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        <Link href="/" className="flex items-center gap-2.5 font-display text-[1.4rem] font-extrabold text-white">
          <span
            aria-hidden="true"
            className="flex size-9 -rotate-[8deg] items-center justify-center rounded-xl bg-kunyit text-xs font-extrabold text-ink shadow-[3px_3px_0_var(--color-jambu)]"
          >
            AR
          </span>
          AR-LOKAL
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-1 text-sm">
          <NavLink href="/about">{t.nav.about}</NavLink>
          {user ? (
            <>
              <NavLink href="/studio" also={['/generate']}>
                {t.nav.studio}
              </NavLink>
              <NavLink href="/history" also={['/model']}>
                {t.nav.history}
              </NavLink>
              <NavLink href="/account">{t.nav.account}</NavLink>
              {user.role === 'admin' && <NavLink href="/admin">{t.nav.admin}</NavLink>}
              <form action="/auth/signout" method="post">
                <button className="nav-item" type="submit">
                  {t.nav.logout}
                </button>
              </form>
            </>
          ) : (
            <>
              <NavLink href="/login">{t.nav.login}</NavLink>
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
    <footer className="mt-24 bg-[#0f0e26] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-10 text-sm md:flex-row md:items-center">
        <div>
          <p className="font-display text-lg font-extrabold">AR-LOKAL</p>
          <p className="mt-1 text-lavender">Foto produk UMKM jadi 3D dan AR.</p>
        </div>
        <nav aria-label="Navigasi bawah" className="flex flex-wrap gap-x-5 gap-y-2 md:ml-auto">
          <Link className="text-lavender hover:text-kunyit" href="/about">
            {t.footer.about}
          </Link>
          <Link className="text-lavender hover:text-kunyit" href="/privacy">
            {t.footer.privacy}
          </Link>
          <Link className="text-lavender hover:text-kunyit" href="/ai-transparency">
            {t.footer.ai}
          </Link>
          <Link className="text-lavender hover:text-kunyit" href="/credits">
            {t.footer.credits}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
