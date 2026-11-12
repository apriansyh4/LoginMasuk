import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, SECURITY_HEADERS } from '@/lib/security-headers';

const PROTECTED = ['/studio', '/history', '/account', '/admin', '/experience'];

/**
 * Runs before every matched request:
 * 1. per-request CSP nonce + security headers
 * 2. refresh the Supabase session cookie
 * 3. optimistic redirect to /login for protected pages. This is NOT the
 *    authorization boundary: every page and route re-checks on the server
 *    (src/server/auth.ts) and the database enforces RLS.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, process.env.NODE_ENV !== 'production', process.env.NEXT_PUBLIC_SUPABASE_URL);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let signedIn = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    // getUser() validates the token with Supabase Auth and refreshes it if needed.
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  }

  const path = request.nextUrl.pathname;
  if (!signedIn && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    response = NextResponse.redirect(login);
  }

  response.headers.set('content-security-policy', csp);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|glb|usdz)$).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
};
