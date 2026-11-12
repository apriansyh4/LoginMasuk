import { AuthForm } from '@/components/auth-form';
import { getDict } from '@/lib/i18n/server';
import { forgotAction } from '../actions';
import { AuthShell } from '../shell';

export const metadata = { title: 'Reset password' };

export default async function ForgotPage() {
  const { t } = await getDict();
  return (
    <AuthShell title={t.auth.resetTitle}>
      <AuthForm
        action={forgotAction}
        submitLabel={t.auth.resetSend}
        messages={t.auth}
        fields={[{ name: 'email', label: t.auth.email, type: 'email', autoComplete: 'email' }]}
      />
    </AuthShell>
  );
}
