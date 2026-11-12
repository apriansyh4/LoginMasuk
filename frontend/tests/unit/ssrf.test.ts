import { describe, expect, it } from 'vitest';
import { isPublicAddress, safeFetch, SafeFetchError, type RawResponse, type Requester, type Resolver } from '@/server/net/ssrf';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.3.4',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '2002:7f00:1::1' /* 6to4 of 127.0.0.1 */,
    '64:ff9b::a00:1' /* NAT64 */,
    'not-an-ip',
  ])('blocks %s', (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(['8.8.8.8', '103.21.244.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) =>
    expect(isPublicAddress(ip)).toBe(true),
  );
});

// Network test doubles: a fake DNS table and a fake HTTP server table.
function fakeNet(dns: Record<string, string[]>, pages: Record<string, { status: number; location?: string; body?: string }>) {
  const contacted: string[] = [];
  const resolver: Resolver = async (host) => {
    const a = dns[host];
    if (!a) throw new Error('NXDOMAIN');
    return a.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
  };
  const requester: Requester = async ({ url, address }) => {
    contacted.push(`${url.toString()}@${address.address}`);
    const p = pages[url.toString()] ?? { status: 404, body: '' };
    const body = Buffer.from(p.body ?? '');
    const res: RawResponse = {
      status: p.status,
      headers: { 'content-type': 'text/html', ...(p.location ? { location: p.location } : {}) },
      body: (async function* () {
        yield body;
      })(),
      close: async () => {},
    };
    return res;
  };
  return { resolver, requester, contacted };
}

const allowAll = () => true;

describe('safeFetch', () => {
  it('fetches an allowed public host and pins the resolved IP', async () => {
    const net = fakeNet({ 'shopee.co.id': ['103.1.2.3'] }, { 'https://shopee.co.id/x': { status: 200, body: 'ok' } });
    const r = await safeFetch('https://shopee.co.id/x', { allowHost: allowAll, ...net });
    expect(r.body.toString()).toBe('ok');
    expect(net.contacted).toEqual(['https://shopee.co.id/x@103.1.2.3']);
  });

  it('rejects http', async () => {
    await expect(safeFetch('http://shopee.co.id/', { allowHost: allowAll })).rejects.toMatchObject({ code: 'NOT_HTTPS' });
  });

  it('rejects literal private IPs without any network access', async () => {
    const net = fakeNet({}, {});
    for (const u of ['https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data/']) {
      await expect(safeFetch(u, { allowHost: allowAll, ...net })).rejects.toMatchObject({ code: 'PRIVATE_ADDRESS' });
    }
    expect(net.contacted).toEqual([]);
  });

  it('rejects a host that resolves to a private address (DNS rebinding style)', async () => {
    const net = fakeNet({ 'evil.example': ['10.0.0.7'] }, {});
    await expect(safeFetch('https://evil.example/', { allowHost: allowAll, ...net })).rejects.toMatchObject({
      code: 'PRIVATE_ADDRESS',
    });
    expect(net.contacted).toEqual([]);
  });

  it('rejects when any of several DNS answers is private', async () => {
    const net = fakeNet({ 'mixed.example': ['8.8.8.8', '127.0.0.1'] }, {});
    await expect(safeFetch('https://mixed.example/', { allowHost: allowAll, ...net })).rejects.toMatchObject({
      code: 'PRIVATE_ADDRESS',
    });
  });

  it('re-checks redirect targets: redirect to a metadata IP is blocked', async () => {
    const net = fakeNet(
      { 'shp.ee': ['103.1.1.1'] },
      { 'https://shp.ee/abc': { status: 302, location: 'https://169.254.169.254/latest/meta-data/' } },
    );
    await expect(safeFetch('https://shp.ee/abc', { allowHost: allowAll, ...net })).rejects.toMatchObject({
      code: 'PRIVATE_ADDRESS',
    });
    expect(net.contacted).toEqual(['https://shp.ee/abc@103.1.1.1']);
  });

  it('re-checks redirect targets against the host allowlist', async () => {
    const net = fakeNet(
      { 'shp.ee': ['103.1.1.1'], 'evil.com': ['8.8.4.4'] },
      { 'https://shp.ee/abc': { status: 301, location: 'https://evil.com/phish' } },
    );
    const allow = (h: string) => h === 'shp.ee' || h.endsWith('shopee.co.id');
    await expect(safeFetch('https://shp.ee/abc', { allowHost: allow, ...net })).rejects.toMatchObject({
      code: 'HOST_NOT_ALLOWED',
    });
  });

  it('blocks a redirect downgrade to http', async () => {
    const net = fakeNet({ 'shp.ee': ['103.1.1.1'] }, { 'https://shp.ee/a': { status: 302, location: 'http://shopee.co.id/x' } });
    await expect(safeFetch('https://shp.ee/a', { allowHost: allowAll, ...net })).rejects.toMatchObject({ code: 'NOT_HTTPS' });
  });

  it('follows at most 3 redirects', async () => {
    const pages: Record<string, { status: number; location?: string }> = {};
    for (let i = 0; i < 5; i++) pages[`https://a.example/${i}`] = { status: 302, location: `/${i + 1}` };
    const net = fakeNet({ 'a.example': ['8.8.8.8'] }, pages);
    await expect(safeFetch('https://a.example/0', { allowHost: allowAll, ...net })).rejects.toMatchObject({
      code: 'TOO_MANY_REDIRECTS',
    });
    const ok = fakeNet({ 'a.example': ['8.8.8.8'] }, { ...pages, 'https://a.example/3': { status: 200 } as { status: number } });
    const r = await safeFetch('https://a.example/0', { allowHost: allowAll, ...ok });
    expect(r.redirects).toHaveLength(3);
    expect(r.finalUrl).toBe('https://a.example/3');
  });

  it('caps the body size', async () => {
    const net = fakeNet({ 'big.example': ['8.8.8.8'] }, { 'https://big.example/': { status: 200, body: 'x'.repeat(5000) } });
    await expect(safeFetch('https://big.example/', { allowHost: allowAll, maxBytes: 1000, ...net })).rejects.toBeInstanceOf(
      SafeFetchError,
    );
  });

  it('rejects non-default ports and credentials', async () => {
    await expect(safeFetch('https://a.example:8443/', { allowHost: allowAll })).rejects.toMatchObject({
      code: 'HOST_NOT_ALLOWED',
    });
    await expect(safeFetch('https://u:p@a.example/', { allowHost: allowAll })).rejects.toMatchObject({
      code: 'HOST_NOT_ALLOWED',
    });
  });
});
