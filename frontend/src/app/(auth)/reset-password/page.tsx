import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { getDict } from '@/lib/i18n/server';
import { getSessionUser } from '@/server/auth';
import { resetAction } from '../actions';
import { AuthShell } from '../shell';

export const metadata = { title: 'New password' };

export default async function ResetPage() {
  const { t } = await getDict();
  const user = await getSessionUser().catch(() => null);
  return (
    <AuthShell title={t.auth.resetTitle}>
      {user ? (
        <AuthForm
          action={resetAction}
          submitLabel={t.auth.savePassword}
          messages={t.auth}
          fields={[
            {
              name: 'password',
              label: t.auth.newPassword,
              type: 'password',
              autoComplete: 'new-password',
              hint: t.auth.passwordHint,
            },
          ]}
        />
      ) : (
        <p className="text-ink-soft">
          {t.auth.linkInvalid}{' '}
          <Link className="text-indigo underline" href="/forgot-password">
            {t.auth.resetSend}
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
