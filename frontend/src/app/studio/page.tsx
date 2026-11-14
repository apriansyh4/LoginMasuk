import { getDict } from '@/lib/i18n/server';
import { requirePageUser } from '@/server/auth';
import { StudioForm } from './studio-form';

export const metadata = { title: 'Studio' };

export default async function StudioPage() {
  await requirePageUser('/studio');
  const { t } = await getDict();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="page-title">{t.studio.title}</h1>
      <p className="mt-4 text-lg text-ink-soft">{t.studio.intro}</p>
      <div className="mt-8">
        <StudioForm t={{ studio: t.studio, history: t.history, common: t.common }} />
      </div>
    </div>
  );
}
