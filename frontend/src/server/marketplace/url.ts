/**
 * Marketplace URL allowlist (Section 5A). Pure functions, no network.
 * Accepts only HTTPS product-detail URLs on Shopee Indonesia and Tokopedia.
 */

export type Marketplace = 'shopee' | 'tokopedia';

export type UrlRejection = 'INVALID_URL' | 'NOT_HTTPS' | 'UNSUPPORTED_SITE' | 'NOT_PRODUCT_PAGE' | 'URL_TOO_LONG';

export type ClassifiedUrl =
  | { ok: true; kind: 'product'; marketplace: Marketplace; canonicalUrl: string; original: string }
  | { ok: true; kind: 'short_link'; marketplace: Marketplace; original: string }
  | { ok: false; code: UrlRejection };

const MAX_URL_LENGTH = 2048;

/** Exact host or a true subdomain (label boundary). Rejects `shopee.co.id.evil.com`, `evilshopee.co.id`. */
export function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

const SHORT_LINK_HOSTS: Record<string, Marketplace> = {
  'shp.ee': 'shopee',
  'id.shp.ee': 'shopee',
  's.shopee.co.id': 'shopee',
  'tokopedia.link': 'tokopedia',
  'tkp.me': 'tokopedia',
};

// First path segments on tokopedia.com that are not shops.
const TOKOPEDIA_RESERVED = new Set([
  'search',
  'p',
  'discovery',
  'promo',
  'help',
  'cart',
  'login',
  'register',
  'find',
  'hot',
  'top-up',
  'blog',
  'about',
  'careers',
  'official-store',
  'mitra',
  'events',
  'b',
  'play',
  'feed',
  'chat',
  'user',
  'settings',
  'order-list',
  'wishlist',
  'category',
  'kategori',
  'tokopedia-care',
  'edu',
  'seller',
  'affiliate',
  'pulsa',
  'tagihan',
  'travel',
  'deals',
  'emas',
  'now',
  'rewards',
]);
// Second segments under a shop that are shop sub-pages, not products.
const TOKOPEDIA_SHOP_SUBPAGES = new Set(['review', 'etalase', 'product', 'info', 'note', 'feed', 'campaign', 'showcase']);

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,120}$/;

export function classifyMarketplaceUrl(input: string): ClassifiedUrl {
  const raw = input.trim();
  if (raw.length === 0) return { ok: false, code: 'INVALID_URL' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, code: 'URL_TOO_LONG' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: 'INVALID_URL' };
  }
  if (url.protocol !== 'https:') return { ok: false, code: 'NOT_HTTPS' };
  if (url.username || url.password || (url.port && url.port !== '443')) return { ok: false, code: 'UNSUPPORTED_SITE' };

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const short = SHORT_LINK_HOSTS[host];
  if (short) return { ok: true, kind: 'short_link', marketplace: short, original: raw };

  const path = decodePathSafe(url.pathname);
  if (path === null) return { ok: false, code: 'INVALID_URL' };

  if (hostMatches(host, 'shopee.co.id')) {
    // /<slug>-i.<shopId>.<itemId>
    const a = /^\/([^/]+)-i\.(\d{1,20})\.(\d{1,20})\/?$/.exec(path);
    // /product/<shopId>/<itemId>
    const b = /^\/product\/(\d{1,20})\/(\d{1,20})\/?$/.exec(path);
    const ids = a ? [a[2], a[3]] : b ? [b[1], b[2]] : null;
    if (!ids) return { ok: false, code: 'NOT_PRODUCT_PAGE' };
    return {
      ok: true,
      kind: 'product',
      marketplace: 'shopee',
      canonicalUrl: `https://shopee.co.id/product/${ids[0]}/${ids[1]}`,
      original: raw,
    };
  }

  if (hostMatches(host, 'tokopedia.com')) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length !== 2) return { ok: false, code: 'NOT_PRODUCT_PAGE' };
    const [shop, slug] = parts as [string, string];
    if (!SEGMENT.test(shop) || !SEGMENT.test(slug)) return { ok: false, code: 'NOT_PRODUCT_PAGE' };
    if (TOKOPEDIA_RESERVED.has(shop.toLowerCase()) || TOKOPEDIA_SHOP_SUBPAGES.has(slug.toLowerCase())) {
      return { ok: false, code: 'NOT_PRODUCT_PAGE' };
    }
    return {
      ok: true,
      kind: 'product',
      marketplace: 'tokopedia',
      canonicalUrl: `https://www.tokopedia.com/${shop}/${slug}`,
      original: raw,
    };
  }

  return { ok: false, code: 'UNSUPPORTED_SITE' };
}

function decodePathSafe(p: string): string | null {
  try {
    const d = decodeURIComponent(p);
    // reject encoded separators / traversal tricks
    if (d.includes('\\') || d.includes('/../') || d.endsWith('/..') || d.includes('\0')) return null;
    return d;
  } catch {
    return null;
  }
}

/** Hosts that may serve listing images we fetch after the user picks one. */
export function isAllowedImageHost(host: string): boolean {
  return ['susercontent.com', 'shopee.co.id', 'tokopedia.net', 'tokopedia.com'].some((d) => hostMatches(host, d));
}

/** Hosts we may contact while resolving metadata (product pages, robots.txt, short links). */
export function isAllowedMarketplaceHost(host: string): boolean {
  return (
    hostMatches(host, 'shopee.co.id') ||
    hostMatches(host, 'tokopedia.com') ||
    Object.prototype.hasOwnProperty.call(SHORT_LINK_HOSTS, host.toLowerCase())
  );
}
