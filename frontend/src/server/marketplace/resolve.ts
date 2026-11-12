import 'server-only';
import { serverEnv } from '@/lib/env';
import { isPathAllowed, parseRobots, type RobotsRules } from '@/server/net/robots';
import { safeFetch, SafeFetchError } from '@/server/net/ssrf';
import { extractListingMetadata, type ListingMetadata } from './extract';
import { classifyMarketplaceUrl, isAllowedImageHost, isAllowedMarketplaceHost, type Marketplace } from './url';

export type ResolveResult =
  | {
      ok: true;
      marketplace: Marketplace;
      originalUrl: string;
      canonicalUrl: string;
      metadataStatus: 'ok' | 'unavailable';
      metadataReason?: string;
      metadata: ListingMetadata | null;
      retrievedAt: string;
    }
  | { ok: false; code: string };

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: ResolveResult }>();
const robotsCache = new Map<string, { at: number; rules: RobotsRules | 'disallow-all' }>();

async function robotsFor(origin: string, ua: string): Promise<RobotsRules | 'disallow-all'> {
  const hit = robotsCache.get(origin);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.rules;
  let rules: RobotsRules | 'disallow-all';
  try {
    const r = await safeFetch(`${origin}/robots.txt`, {
      allowHost: isAllowedMarketplaceHost,
      headers: { 'user-agent': ua },
      maxBytes: 512 * 1024,
    });
    if (r.status >= 200 && r.status < 300) rules = parseRobots(r.body.toString('utf8'), ua);
    else if (r.status >= 400 && r.status < 500)
      rules = { allow: [], disallow: [] }; // RFC 9309: unavailable => allowed
    else rules = 'disallow-all';
  } catch {
    rules = 'disallow-all'; // unreachable => assume disallowed
  }
  robotsCache.set(origin, { at: Date.now(), rules });
  return rules;
}

/**
 * Validate a marketplace URL and fetch best-effort public metadata.
 * Respects robots.txt, honest User-Agent, unauthenticated GET only, cached.
 * Never bypasses login/CAPTCHA/anti-bot: any non-200 or missing fields =>
 * metadataStatus 'unavailable' and the user uploads the image instead.
 */
export async function resolveMarketplaceUrl(input: string): Promise<ResolveResult> {
  const c = classifyMarketplaceUrl(input);
  if (!c.ok) return { ok: false, code: c.code };
  const ua = serverEnv().MARKETPLACE_USER_AGENT;

  let product = c.kind === 'product' ? c : null;
  if (c.kind === 'short_link') {
    try {
      const r = await safeFetch(c.original, {
        allowHost: isAllowedMarketplaceHost,
        maxRedirects: 3,
        headers: { 'user-agent': ua },
        maxBytes: 256 * 1024,
      });
      const target = classifyMarketplaceUrl(r.finalUrl);
      if (!target.ok || target.kind !== 'product') return { ok: false, code: 'SHORT_LINK_NOT_PRODUCT' };
      product = { ...target, original: c.original };
    } catch (e) {
      return { ok: false, code: e instanceof SafeFetchError ? `SHORT_LINK_${e.code}` : 'SHORT_LINK_FAILED' };
    }
  }
  if (!product) return { ok: false, code: 'NOT_PRODUCT_PAGE' };

  const cached = cache.get(product.canonicalUrl);
  if (cached && Date.now() - cached.at < TTL_MS && cached.value.ok) {
    return { ...cached.value, originalUrl: product.original };
  }

  const base = {
    ok: true as const,
    marketplace: product.marketplace,
    originalUrl: product.original,
    canonicalUrl: product.canonicalUrl,
    retrievedAt: new Date().toISOString(),
  };
  const canonical = new URL(product.canonicalUrl);
  const rules = await robotsFor(canonical.origin, ua);
  if (rules === 'disallow-all' || !isPathAllowed(rules, canonical.pathname + canonical.search)) {
    const value = { ...base, metadataStatus: 'unavailable' as const, metadataReason: 'ROBOTS_DISALLOWED', metadata: null };
    cache.set(product.canonicalUrl, { at: Date.now(), value });
    return value;
  }
  let metadata: ListingMetadata | null = null;
  let reason: string | undefined;
  try {
    const page = await safeFetch(product.canonicalUrl, {
      allowHost: isAllowedMarketplaceHost,
      headers: { 'user-agent': ua, accept: 'text/html' },
      maxBytes: 3 * 1024 * 1024,
    });
    if (page.status !== 200 || !(page.contentType ?? '').includes('html')) reason = `HTTP_${page.status}`;
    else {
      metadata = extractListingMetadata(page.body.toString('utf8'), page.finalUrl);
      metadata.images = metadata.images.filter((u) => isAllowedImageHost(new URL(u).hostname));
      if (!metadata.title && metadata.images.length === 0) {
        reason = 'NO_PUBLIC_METADATA';
        metadata = null;
      }
    }
  } catch (e) {
    reason = e instanceof SafeFetchError ? e.code : 'FETCH_FAILED';
  }
  const value: ResolveResult = metadata
    ? { ...base, metadataStatus: 'ok', metadata }
    : { ...base, metadataStatus: 'unavailable', metadataReason: reason, metadata: null };
  cache.set(product.canonicalUrl, { at: Date.now(), value });
  return value;
}

/** Fetch exactly one listing image the user picked; it must be one we extracted. */
export async function fetchListingImage(resolved: Extract<ResolveResult, { ok: true }>, imageUrl: string): Promise<Buffer> {
  if (!resolved.metadata?.images.includes(imageUrl)) throw new SafeFetchError('HOST_NOT_ALLOWED', 'image not in listing');
  const r = await safeFetch(imageUrl, {
    allowHost: isAllowedImageHost,
    headers: { 'user-agent': serverEnv().MARKETPLACE_USER_AGENT, accept: 'image/*' },
    maxBytes: 10 * 1024 * 1024,
    maxRedirects: 2,
  });
  if (r.status !== 200) throw new SafeFetchError('NETWORK', `HTTP_${r.status}`);
  return r.body;
}
