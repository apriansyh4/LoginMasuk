import 'server-only';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, request as undiciRequest } from 'undici';

/**
 * SSRF-safe HTTPS fetcher (Section 12).
 * - HTTPS only, host allowlist checked on every hop
 * - DNS resolved by us; every resolved address must be public unicast
 *   (blocks private, loopback, link-local, CGNAT, metadata, ULA, mapped/embedded IPv4 tricks)
 * - the connection is pinned to the checked IP (no DNS rebinding between check and connect)
 * - manual redirects (<= maxRedirects), each target re-validated
 * - response size and total time capped
 */

export class SafeFetchError extends Error {
  constructor(
    public readonly code:
      | 'NOT_HTTPS'
      | 'HOST_NOT_ALLOWED'
      | 'PRIVATE_ADDRESS'
      | 'DNS_FAILED'
      | 'TOO_MANY_REDIRECTS'
      | 'TOO_LARGE'
      | 'TIMEOUT'
      | 'BAD_REDIRECT'
      | 'NETWORK',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'SafeFetchError';
  }
}

/** True only for globally routable unicast addresses. */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let ip = ipaddr.parse(address);
  if (ip.kind() === 'ipv6') {
    const v6 = ip as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) ip = v6.toIPv4Address();
    else {
      // only global unicast; reject 6to4 / teredo / NAT64 etc. that embed IPv4
      const range = v6.range();
      return range === 'unicast';
    }
  }
  return (ip as ipaddr.IPv4).range() === 'unicast';
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type Resolver = (host: string) => Promise<ResolvedAddress[]>;

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  close: () => Promise<void>;
}
export type Requester = (args: {
  url: URL;
  address: ResolvedAddress;
  headers: Record<string, string>;
  signal: AbortSignal;
}) => Promise<RawResponse>;

export const defaultResolver: Resolver = async (host) => {
  const res = await dnsLookup(host, { all: true, verbatim: true });
  return res.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

export const undiciRequester: Requester = async ({ url, address, headers, signal }) => {
  // Pin the socket to the validated address; TLS SNI/certificate still use the hostname.
  type LookupCb = (err: Error | null, addr: string | { address: string; family: number }[], family?: number) => void;
  const pinnedLookup = (_host: string, options: { all?: boolean }, cb: LookupCb) =>
    options?.all ? cb(null, [{ address: address.address, family: address.family }]) : cb(null, address.address, address.family);
  // undici never follows redirects for request(); we handle them manually above.
  const agent = new Agent({ connect: { lookup: pinnedLookup } } as unknown as ConstructorParameters<typeof Agent>[0]);
  const res = await undiciRequest(url, { method: 'GET', headers, signal, dispatcher: agent });
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body,
    close: async () => {
      res.body.destroy();
      await agent.close();
    },
  };
};

export interface SafeFetchOptions {
  allowHost: (host: string) => boolean;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  resolver?: Resolver;
  requester?: Requester;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string | null;
  body: Buffer;
  redirects: string[];
}

export async function safeFetch(input: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024;
  const resolver = opts.resolver ?? defaultResolver;
  const requester = opts.requester ?? undiciRequester;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  const redirects: string[] = [];
  let current = parseHttps(input);
  try {
    for (let hop = 0; ; hop++) {
      const host = current.hostname.replace(/^\[|\]$/g, '');
      if (!opts.allowHost(host)) throw new SafeFetchError('HOST_NOT_ALLOWED', host);
      const addresses = await resolveChecked(host, resolver);
      const res = await requester({
        url: current,
        address: addresses[0]!,
        headers: { accept: '*/*', ...opts.headers },
        signal: controller.signal,
      }).catch((e: unknown) => {
        if (controller.signal.aborted) throw new SafeFetchError('TIMEOUT');
        throw new SafeFetchError('NETWORK', e instanceof Error ? e.name : 'error');
      });
      if (res.status >= 300 && res.status < 400) {
        await res.close();
        const loc = header(res.headers, 'location');
        if (!loc) throw new SafeFetchError('BAD_REDIRECT');
        if (hop >= maxRedirects) throw new SafeFetchError('TOO_MANY_REDIRECTS');
        let next: URL;
        try {
          next = new URL(loc, current);
        } catch {
          throw new SafeFetchError('BAD_REDIRECT');
        }
        current = parseHttps(next.toString());
        redirects.push(current.toString());
        continue;
      }
      const declared = Number(header(res.headers, 'content-length') ?? '0');
      if (declared > maxBytes) {
        await res.close();
        throw new SafeFetchError('TOO_LARGE');
      }
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of res.body) {
          size += chunk.byteLength;
          if (size > maxBytes) throw new SafeFetchError('TOO_LARGE');
          chunks.push(Buffer.from(chunk));
        }
      } catch (e) {
        if (e instanceof SafeFetchError) throw e;
        if (controller.signal.aborted) throw new SafeFetchError('TIMEOUT');
        throw new SafeFetchError('NETWORK');
      } finally {
        await res.close();
      }
      return {
        finalUrl: current.toString(),
        status: res.status,
        contentType: header(res.headers, 'content-type') ?? null,
        body: Buffer.concat(chunks),
        redirects,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}

function parseHttps(u: string): URL {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    throw new SafeFetchError('BAD_REDIRECT');
  }
  if (url.protocol !== 'https:') throw new SafeFetchError('NOT_HTTPS');
  if (url.username || url.password) throw new SafeFetchError('HOST_NOT_ALLOWED');
  if (url.port && url.port !== '443') throw new SafeFetchError('HOST_NOT_ALLOWED');
  return url;
}

async function resolveChecked(host: string, resolver: Resolver): Promise<ResolvedAddress[]> {
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new SafeFetchError('PRIVATE_ADDRESS');
    return [{ address: host, family: isIP(host) === 6 ? 6 : 4 }];
  }
  let addrs: ResolvedAddress[];
  try {
    addrs = await resolver(host);
  } catch {
    throw new SafeFetchError('DNS_FAILED');
  }
  if (addrs.length === 0) throw new SafeFetchError('DNS_FAILED');
  // every answer must be public, otherwise an attacker could mix records
  if (!addrs.every((a) => isPublicAddress(a.address))) throw new SafeFetchError('PRIVATE_ADDRESS');
  return addrs;
}

function header(h: RawResponse['headers'], name: string): string | undefined {
  const v = h[name] ?? h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
