import { getDict } from '@/lib/i18n/server';
import { requirePageUser } from '@/server/auth';
import { StudioForm } from './studio-form';

export const metadata = { title: 'Studio' };

export default async function StudioPage() {
  await requirePageUser('/studio');
  const { t } = await getDict();
  return (
    <div className="mx-auto max-w-3xl">
      <p className="eyebrow">{t.common.brand}</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">{t.studio.title}</h1>
      <p className="mt-3 text-ink-soft">{t.studio.intro}</p>
      <div className="mt-8">
        <StudioForm t={{ studio: t.studio, urlErrors: t.urlErrors, history: t.history, common: t.common }} />
      </div>
    </div>
  );
}
