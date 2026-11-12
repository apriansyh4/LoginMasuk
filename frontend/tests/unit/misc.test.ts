import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/redirect';
import { buildCsp } from '@/lib/security-headers';
import { sniffImage } from '@/server/images';

describe('safeNext (open-redirect guard)', () => {
  it.each(['/studio', '/history?status=rejected', '/studio/abc'])('keeps %s', (p) => expect(safeNext(p)).toBe(p));
  it.each(['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, undefined, '/x\r\nSet-Cookie: a=b'])(
    'rejects %s',
    (p) => expect(safeNext(p as string)).toBe('/studio'),
  );
});

describe('CSP', () => {
  it('uses a nonce, forbids framing/objects, and only adds unsafe-eval in dev', () => {
    const prod = buildCsp('abc', false, 'https://xyz.supabase.co');
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).not.toContain('unsafe-eval');
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain('connect-src');
    expect(prod).toContain('wss://xyz.supabase.co');
    expect(buildCsp('abc', true)).toContain("'unsafe-eval'");
  });
});

describe('sniffImage (content, not extension)', () => {
  it('detects by magic bytes', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('webp');
    expect(sniffImage(Buffer.from('<html>not an image</html>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
  });
});
