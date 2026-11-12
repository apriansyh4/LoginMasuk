import { describe, expect, it } from 'vitest';
import { classifyMarketplaceUrl, hostMatches, isAllowedImageHost } from '@/server/marketplace/url';

describe('classifyMarketplaceUrl: accepted', () => {
  it.each([
    ['https://shopee.co.id/Tas-Rotan-Bali-Bulat-i.123456.789012345', 'https://shopee.co.id/product/123456/789012345'],
    ['https://shopee.co.id/product/123456/789012345', 'https://shopee.co.id/product/123456/789012345'],
    ['https://shopee.co.id/product/123456/789012345/?sp_atk=x', 'https://shopee.co.id/product/123456/789012345'],
    ['https://www.shopee.co.id/Vas-Keramik-i.1.2', 'https://shopee.co.id/product/1/2'],
  ])('shopee %s', (input, canonical) => {
    const r = classifyMarketplaceUrl(input);
    expect(r).toMatchObject({ ok: true, kind: 'product', marketplace: 'shopee', canonicalUrl: canonical, original: input });
  });

  it.each([
    [
      'https://www.tokopedia.com/kerajinanjogja/tas-rotan-bulat-bali',
      'https://www.tokopedia.com/kerajinanjogja/tas-rotan-bulat-bali',
    ],
    ['https://tokopedia.com/toko_batik/kemeja-batik-tulis?extParam=1', 'https://www.tokopedia.com/toko_batik/kemeja-batik-tulis'],
  ])('tokopedia %s', (input, canonical) => {
    expect(classifyMarketplaceUrl(input)).toMatchObject({ ok: true, marketplace: 'tokopedia', canonicalUrl: canonical });
  });

  it('keeps the original URL verbatim', () => {
    const u = 'https://shopee.co.id/Tas-i.1.2?utm_source=wa&x=%20y';
    const r = classifyMarketplaceUrl(u);
    expect(r.ok && r.original).toBe(u);
  });

  it.each(['https://shp.ee/abc123', 'https://id.shp.ee/xyz', 'https://tokopedia.link/AbCd', 'https://tkp.me/x'])(
    'recognises short link %s (must be resolved safely)',
    (u) => expect(classifyMarketplaceUrl(u)).toMatchObject({ ok: true, kind: 'short_link' }),
  );
});

describe('classifyMarketplaceUrl: rejected', () => {
  it.each([
    ['http://shopee.co.id/Tas-i.1.2', 'NOT_HTTPS'],
    ['ftp://shopee.co.id/x', 'NOT_HTTPS'],
    ['javascript:alert(1)', 'NOT_HTTPS'],
    ['not a url', 'INVALID_URL'],
    ['', 'INVALID_URL'],
    // lookalike / unsupported hosts
    ['https://shopee.co.id.evil.com/Tas-i.1.2', 'UNSUPPORTED_SITE'],
    ['https://evilshopee.co.id/Tas-i.1.2', 'UNSUPPORTED_SITE'],
    ['https://shopee.com.my/Tas-i.1.2', 'UNSUPPORTED_SITE'],
    ['https://tokopedia.com.evil.io/shop/item', 'UNSUPPORTED_SITE'],
    ['https://www.lazada.co.id/products/x-i1.html', 'UNSUPPORTED_SITE'],
    ['https://www.instagram.com/p/abc/', 'UNSUPPORTED_SITE'],
    ['https://example.com/', 'UNSUPPORTED_SITE'],
    ['https://user:pw@shopee.co.id/Tas-i.1.2', 'UNSUPPORTED_SITE'],
    ['https://shopee.co.id:8443/Tas-i.1.2', 'UNSUPPORTED_SITE'],
    ['https://shp.ee.evil.com/abc', 'UNSUPPORTED_SITE'],
    // not a product page
    ['https://shopee.co.id/', 'NOT_PRODUCT_PAGE'],
    ['https://shopee.co.id/search?keyword=tas', 'NOT_PRODUCT_PAGE'],
    ['https://shopee.co.id/shop/123456', 'NOT_PRODUCT_PAGE'],
    ['https://shopee.co.id/Tas-cat.11043', 'NOT_PRODUCT_PAGE'],
    ['https://www.tokopedia.com/kerajinanjogja', 'NOT_PRODUCT_PAGE'],
    ['https://www.tokopedia.com/search?q=tas', 'NOT_PRODUCT_PAGE'],
    ['https://www.tokopedia.com/p/fashion-wanita/tas', 'NOT_PRODUCT_PAGE'],
    ['https://www.tokopedia.com/kerajinanjogja/etalase', 'NOT_PRODUCT_PAGE'],
    ['https://www.tokopedia.com/kerajinanjogja/review', 'NOT_PRODUCT_PAGE'],
    ['https://www.tokopedia.com/a/b/c', 'NOT_PRODUCT_PAGE'],
    ['https://www.tokopedia.com/shop/..%2f..%2fadmin', 'INVALID_URL'],
  ])('%s -> %s', (input, code) => {
    expect(classifyMarketplaceUrl(input)).toEqual({ ok: false, code });
  });

  it('rejects overly long URLs', () => {
    expect(classifyMarketplaceUrl(`https://shopee.co.id/${'a'.repeat(3000)}-i.1.2`)).toEqual({ ok: false, code: 'URL_TOO_LONG' });
  });
});

describe('host helpers', () => {
  it('hostMatches requires a label boundary', () => {
    expect(hostMatches('shopee.co.id', 'shopee.co.id')).toBe(true);
    expect(hostMatches('cf.shopee.co.id.', 'shopee.co.id')).toBe(true);
    expect(hostMatches('xshopee.co.id', 'shopee.co.id')).toBe(false);
    expect(hostMatches('shopee.co.id.evil.com', 'shopee.co.id')).toBe(false);
  });
  it('image host allowlist', () => {
    expect(isAllowedImageHost('down-id.img.susercontent.com')).toBe(true);
    expect(isAllowedImageHost('images.tokopedia.net')).toBe(true);
    expect(isAllowedImageHost('susercontent.com.evil.net')).toBe(false);
    expect(isAllowedImageHost('169.254.169.254')).toBe(false);
  });
});
