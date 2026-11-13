import type { Metadata, Viewport } from 'next';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { OfflineBanner } from '@/components/offline-banner';
import { getDict } from '@/lib/i18n/server';
import './globals.css';

// Every page depends on the signed-in user (header, guards), so render per request
// (this used to happen implicitly via the language cookie).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'AR-LOKAL', template: '%s · AR-LOKAL' },
  description: 'Ubah satu foto produk UMKM menjadi model 3D dan AR dengan AI.',
};

export const viewport: Viewport = { themeColor: '#f6b40e', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, t } = await getDict();
  return (
    <html lang={lang}>
      <body className="flex min-h-dvh flex-col overflow-x-clip">
        <SiteHeader />
        <OfflineBanner message={t.common.offline} />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 pt-10">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
