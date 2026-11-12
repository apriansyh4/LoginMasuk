'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { publicEnv, serverEnv } from '@/lib/env';
import { safeNext } from '@/lib/redirect';
import { createClient } from '@/lib/supabase/server';
import { hitRateLimit, RateLimited } from '@/server/rate-limit';

export type FormState = { error?: string; ok?: string } | undefined;

const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
const password = z.string().min(10).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/);

async function clientIp(): Promise<string> {
  const h = await headers();
  // Behind one trusted reverse proxy (see docs/DEPLOYMENT.md); first hop is the client.
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim().slice(0, 64);
}

async function limit(bucket: string, subjects: string[], windowS: number, max: number): Promise<boolean> {
  try {
    for (const s of subjects) await hitRateLimit(bucket, s, windowS, max);
    return true;
  } catch (e) {
    if (e instanceof RateLimited) return false;
    throw e;
  }
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1).max(128) }).safeParse({
    email: form.get('email'),
    password: form.get('password'),
  });
  if (!parsed.success) return { error: 'invalidCredentials' };
  const ip = await clientIp();
  if (!(await limit('login', [`ip:${ip}`, `email:${parsed.data.email}`], 900, serverEnv().RATE_LIMIT_LOGIN_PER_15MIN)))
    return { error: 'rateLimited' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === 'email_not_confirmed') redirect('/verify-email');
    return { error: 'invalidCredentials' }; // same message for unknown email and wrong password
  }
  redirect(safeNext(String(form.get('next') ?? '')));
}

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      email,
      password,
      displayName: z.string().trim().min(1).max(80),
      consent: z.literal('on'),
    })
    .safeParse({
      email: form.get('email'),
      password: form.get('password'),
      displayName: form.get('displayName'),
      consent: form.get('consent'),
    });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === 'password' ? 'passwordHint' : field === 'consent' ? 'consentRequired' : 'errorGeneric' };
  }
  const ip = await clientIp();
  if (!(await limit('register', [`ip:${ip}`], 3600, serverEnv().RATE_LIMIT_REGISTER_PER_HOUR))) return { error: 'rateLimited' };
  const supabase = await createClient();
  const next = safeNext(String(form.get('next') ?? ''));
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Only display name + consent time. Role is never taken from metadata (DB trigger forces 'user').
      data: { display_name: parsed.data.displayName, consented_at: new Date().toISOString() },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error && error.code !== 'user_already_exists') return { error: 'errorGeneric' };
  // Same response whether or not the email already exists (no account enumeration).
  redirect('/verify-email?sent=1');
}

export async function forgotAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get('email'));
  if (!parsed.success) return { error: 'errorGeneric' };
  const ip = await clientIp();
  if (!(await limit('reset', [`ip:${ip}`, `email:${parsed.data}`], 3600, 5))) return { error: 'rateLimited' };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });
  return { ok: 'resetSent' };
}

export async function resetAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = password.safeParse(form.get('password'));
  if (!parsed.success) return { error: 'passwordHint' };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: 'linkInvalid' };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: 'errorGeneric' };
  return { ok: 'passwordSaved' };
}

export async function resendAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get('email'));
  if (!parsed.success) return { error: 'errorGeneric' };
  const ip = await clientIp();
  if (!(await limit('resend', [`ip:${ip}`, `email:${parsed.data}`], 3600, 3))) return { error: 'rateLimited' };
  const supabase = await createClient();
  await supabase.auth.resend({
    type: 'signup',
    email: parsed.data,
    options: { emailRedirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  return { ok: 'checkEmail' };
}
