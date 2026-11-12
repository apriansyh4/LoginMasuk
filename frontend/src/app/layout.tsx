import type { Metadata, Viewport } from 'next';
import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { OfflineBanner } from '@/components/offline-banner';
import { getDict } from '@/lib/i18n/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'AR-LOKAL', template: '%s · AR-LOKAL' },
  description: 'Turn one product photo into an AI-generated 3D model and AR experience for Indonesian MSMEs.',
};

export const viewport: Viewport = { themeColor: '#fbf8f3', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, t } = await getDict();
  return (
    <html lang={lang}>
      <body className="min-h-dvh">
        <SiteHeader />
        <OfflineBanner message={t.common.offline} />
        <main id="main" className="mx-auto w-full max-w-6xl px-5 pt-10">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
