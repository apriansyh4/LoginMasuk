import { AuthForm } from '@/components/auth-form';
import { getDict } from '@/lib/i18n/server';
import { resendAction } from '../actions';
import { AuthShell } from '../shell';

export const metadata = { title: 'Verifikasi email' };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  const { t } = await getDict();
  return (
    <AuthShell title={t.auth.checkEmailTitle}>
      <p className="text-ink-soft">{sent ? t.auth.checkEmail : t.auth.verifyRequired}</p>
      <div className="mt-6 border-t border-sand pt-6">
        <AuthForm
          action={resendAction}
          submitLabel={t.auth.resend}
          messages={t.auth}
          fields={[{ name: 'email', label: t.auth.email, type: 'email', autoComplete: 'email' }]}
        />
      </div>
    </AuthShell>
  );
}
