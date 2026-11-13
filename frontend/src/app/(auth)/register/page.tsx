import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { getDict } from '@/lib/i18n/server';
import { safeNext } from '@/lib/redirect';
import { registerAction } from '../actions';
import { AuthShell } from '../shell';

export const metadata = { title: 'Daftar' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const { t } = await getDict();
  return (
    <AuthShell
      title={t.auth.registerTitle}
      footer={
        <>
          {t.auth.haveAccount}{' '}
          <Link className="font-medium text-nila underline" href={`/login?next=${encodeURIComponent(next)}`}>
            {t.nav.login}
          </Link>
        </>
      }
    >
      <AuthForm
        action={registerAction}
        hidden={{ next }}
        submitLabel={t.auth.submitRegister}
        messages={t.auth}
        consent={{ label: t.auth.consent, privacyLabel: t.auth.privacyLink, aiLabel: t.auth.aiLink }}
        fields={[
          { name: 'displayName', label: t.auth.displayName, type: 'text', autoComplete: 'nickname' },
          { name: 'email', label: t.auth.email, type: 'email', autoComplete: 'email' },
          { name: 'password', label: t.auth.password, type: 'password', autoComplete: 'new-password', hint: t.auth.passwordHint },
        ]}
      />
    </AuthShell>
  );
}
