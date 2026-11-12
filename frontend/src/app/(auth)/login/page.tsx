import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { getDict } from '@/lib/i18n/server';
import { safeNext } from '@/lib/redirect';
import { getSessionUser } from '@/server/auth';
import { loginAction } from '../actions';
import { AuthShell } from '../shell';

export const metadata = { title: 'Login' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getSessionUser().catch(() => null)) redirect(next);
  const { t } = await getDict();
  return (
    <AuthShell
      title={t.auth.loginTitle}
      footer={
        <>
          {t.auth.noAccount}{' '}
          <Link className="font-medium text-terracotta underline" href={`/register?next=${encodeURIComponent(next)}`}>
            {t.nav.register}
          </Link>
        </>
      }
    >
      <AuthForm
        action={loginAction}
        hidden={{ next }}
        initialError={sp.error === 'link_invalid' ? 'linkInvalid' : undefined}
        submitLabel={t.auth.submitLogin}
        messages={t.auth}
        fields={[
          { name: 'email', label: t.auth.email, type: 'email', autoComplete: 'email' },
          { name: 'password', label: t.auth.password, type: 'password', autoComplete: 'current-password' },
        ]}
      />
      <p className="mt-4 text-sm">
        <Link className="text-indigo underline" href="/forgot-password">
          {t.auth.forgot}
        </Link>
      </p>
    </AuthShell>
  );
}
