import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin, route } from '@/server/http';

export const POST = route(async (request: NextRequest) => {
  assertSameOrigin(request);
  const supabase = await createClient();
  await supabase.auth.signOut();
  const dest = request.nextUrl.clone();
  dest.pathname = '/';
  dest.search = '';
  return NextResponse.redirect(dest, { status: 303 });
});
