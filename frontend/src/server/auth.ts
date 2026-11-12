import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface SessionUser {
  id: string;
  email: string | null;
  role: 'user' | 'admin';
  isActive: boolean;
  displayName: string | null;
  emailVerified: boolean;
}

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: string,
  ) {
    super(code);
  }
}

/**
 * Authoritative check: validates the JWT with Supabase Auth (getUser, not
 * getSession) and reads role/is_active from public.profiles, never from
 * client-editable user metadata.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active, display_name')
    .eq('id', data.user.id)
    .maybeSingle();
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    // no profile row (e.g. suspended: RLS hides nothing for own row, but be safe) => least privilege
    role: profile?.role === 'admin' ? 'admin' : 'user',
    isActive: profile?.is_active ?? false,
    displayName: profile?.display_name ?? null,
    emailVerified: Boolean(data.user.email_confirmed_at),
  };
}

/** For Route Handlers: throws AuthError (mapped to JSON 401/403). */
export async function requireApiUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new AuthError(401, 'UNAUTHENTICATED');
  if (!u.isActive) throw new AuthError(403, 'ACCOUNT_SUSPENDED');
  if (!u.emailVerified) throw new AuthError(403, 'EMAIL_NOT_VERIFIED');
  return u;
}

export async function requireApiAdmin(): Promise<SessionUser> {
  const u = await requireApiUser();
  if (u.role !== 'admin') throw new AuthError(403, 'FORBIDDEN');
  return u;
}

/** For Server Components / pages: redirects instead of throwing. */
export async function requirePageUser(next: string): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!u.isActive) redirect('/suspended');
  if (!u.emailVerified) redirect('/verify-email');
  return u;
}

export async function requirePageAdmin(next: string): Promise<SessionUser> {
  const u = await requirePageUser(next);
  if (u.role !== 'admin') redirect('/forbidden');
  return u;
}

export { safeNext } from '@/lib/redirect';
