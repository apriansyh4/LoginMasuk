/**
 * Extract product metadata from a public HTML page: Open Graph / product meta
 * tags and JSON-LD `Product`. Only values that are actually present are
 * returned; anything missing stays null. Never invents values.
 */

export interface ListingMetadata {
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  seller: string | null;
  images: string[];
}

const MAX_IMAGES = 12;

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1]!.toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}

const clean = (s: unknown, max = 500): string | null => {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

function parsePrice(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  // plain machine-readable numbers only ("125000", "125000.00"); no guessing on "Rp125.000"
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

function absUrl(u: string, base: string): string | null {
  try {
    const url = new URL(u, base);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function findProducts(node: Json, out: Record<string, Json>[] = []): Record<string, Json>[] {
  if (Array.isArray(node)) node.forEach((n) => findProducts(n, out));
  else if (node && typeof node === 'object') {
    const t = node['@type'];
    if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) out.push(node);
    if (node['@graph']) findProducts(node['@graph'], out);
  }
  return out;
}

export function extractListingMetadata(html: string, pageUrl: string): ListingMetadata {
  const meta: Record<string, string[]> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? a.itemprop)?.toLowerCase();
    if (key && a.content !== undefined) (meta[key] ??= []).push(a.content);
  }
  const first = (k: string) => meta[k]?.[0];

  const result: ListingMetadata = {
    title: clean(first('og:title') ?? first('twitter:title'), 300),
    description: clean(first('og:description') ?? first('description'), 1000),
    price: parsePrice(first('product:price:amount') ?? first('og:price:amount')),
    currency: clean(first('product:price:currency') ?? first('og:price:currency'), 3),
    seller: null,
    images: [],
  };
  const images = new Set<string>();
  for (const u of [...(meta['og:image'] ?? []), ...(meta['og:image:secure_url'] ?? [])]) {
    const a = absUrl(u, pageUrl);
    if (a) images.add(a);
  }

  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: Json;
    try {
      data = JSON.parse(m[1]!) as Json;
    } catch {
      continue;
    }
    for (const p of findProducts(data)) {
      result.title ??= clean(p.name, 300);
      result.description ??= clean(p.description, 1000);
      const imgs = Array.isArray(p.image) ? p.image : p.image ? [p.image] : [];
      for (const i of imgs) {
        const s = typeof i === 'string' ? i : i && typeof i === 'object' && !Array.isArray(i) ? i.url : null;
        const a = typeof s === 'string' ? absUrl(s, pageUrl) : null;
        if (a) images.add(a);
      }
      const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
      if (offers && typeof offers === 'object' && !Array.isArray(offers)) {
        result.price ??= parsePrice(offers.price ?? offers.lowPrice);
        result.currency ??= clean(offers.priceCurrency, 3);
        const seller = offers.seller;
        if (seller && typeof seller === 'object' && !Array.isArray(seller)) result.seller ??= clean(seller.name, 200);
      }
      // note: `brand` is not the seller and is deliberately not substituted
    }
  }
  if (result.currency && !/^[A-Z]{3}$/.test(result.currency)) result.currency = null;
  if (result.price !== null && !result.currency) result.price = null; // a price without currency is not usable
  result.images = [...images].slice(0, MAX_IMAGES);
  return result;
}
