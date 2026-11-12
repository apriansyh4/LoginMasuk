import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { requireApiUser } from '@/server/auth';
import { MAX_UPLOAD_BYTES } from '@/server/images';
import { assertSameOrigin, jsonError, route } from '@/server/http';
import { hitRateLimit } from '@/server/rate-limit';
import { createSubmission, submissionFields } from '@/server/submissions';

export const runtime = 'nodejs';

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await requireApiUser();
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return jsonError(413, 'FILE_TOO_LARGE');
  await hitRateLimit('upload', user.id, 3600, serverEnv().RATE_LIMIT_UPLOAD_PER_HOUR);
  await hitRateLimit('validate_daily', user.id, 86_400, serverEnv().RATE_LIMIT_VALIDATE_PER_DAY);

  const form = await req.formData();
  const fields = submissionFields.parse({
    source: form.get('source'),
    name: form.get('name') ?? undefined,
    productUrl: form.get('productUrl') ?? undefined,
    imageUrl: form.get('imageUrl') ?? undefined,
    rightsConfirmed: form.get('rightsConfirmed'),
    size: form.get('size') ? JSON.parse(String(form.get('size'))) : undefined,
  });
  const f = form.get('file');
  let file: Buffer | null = null;
  if (f && typeof f !== 'string') {
    if (f.size > MAX_UPLOAD_BYTES) return jsonError(413, 'FILE_TOO_LARGE');
    file = Buffer.from(await f.arrayBuffer());
  }
  const out = await createSubmission(user.id, fields, file);
  if (!out.ok) return jsonError(out.status, out.error);
  return NextResponse.json(
    { productId: out.productId, isValid: out.validation?.isValid ?? false },
    { status: 201, headers: { 'cache-control': 'no-store' } },
  );
});
