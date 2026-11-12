import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/redirect';
import { createClient } from '@/lib/supabase/server';

/** Email verification / password recovery / OAuth landing. Supports PKCE `code` and `token_hash`. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get('next'));
  const supabase = await createClient();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  const target = !ok ? '/login?error=link_invalid' : type === 'recovery' ? '/reset-password' : next;
  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
