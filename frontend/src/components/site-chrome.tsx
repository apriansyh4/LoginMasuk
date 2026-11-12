import Link from 'next/link';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getDict } from '@/lib/i18n/server';
import { getSessionUser } from '@/server/auth';

async function setLang(form: FormData) {
  'use server';
  const lang = form.get('lang') === 'en' ? 'en' : 'id';
  (await cookies()).set('lang', lang, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, httpOnly: false });
  revalidatePath('/', 'layout');
}

export async function SiteHeader() {
  const { lang, t } = await getDict();
  const user = await getSessionUser().catch(() => null);
  return (
    <header className="border-b border-sand/70 bg-paper/90 backdrop-blur">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink">
          AR<span className="text-terracotta">·</span>LOKAL
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
          <form action={setLang} className="ml-1">
            <input type="hidden" name="lang" value={lang === 'id' ? 'en' : 'id'} />
            <button
              className="btn-ghost px-3"
              type="submit"
              aria-label={lang === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
            >
              <span aria-hidden="true">{lang === 'id' ? 'EN' : 'ID'}</span>
            </button>
          </form>
        </div>
      </nav>
    </header>
  );
}

export async function SiteFooter() {
  const { t } = await getDict();
  return (
    <footer className="mt-24 border-t border-sand/70 bg-cream/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-ink-soft md:flex-row md:items-center">
        <p className="font-display text-base text-ink">AR·LOKAL</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-4">
          <Link href="/about">{t.footer.about}</Link>
          <Link href="/privacy">{t.footer.privacy}</Link>
          <Link href="/ai-transparency">{t.footer.ai}</Link>
          <Link href="/credits">{t.footer.credits}</Link>
        </nav>
        <p className="md:ml-auto">{t.common.notAffiliated}</p>
      </div>
    </footer>
  );
}
