import { describe, expect, it } from 'vitest';
import { extractListingMetadata } from '@/server/marketplace/extract';
import { isPathAllowed, parseRobots } from '@/server/net/robots';

describe('extractListingMetadata', () => {
  it('reads Open Graph and product price tags', () => {
    const html = `<html><head>
      <meta property="og:title" content="Tas Rotan Bali &amp; Kulit">
      <meta content="https://down-id.img.susercontent.com/file/a.jpg" property="og:image">
      <meta property="og:image" content="/relative/b.jpg">
      <meta property="product:price:amount" content="125000">
      <meta property="product:price:currency" content="IDR">
    </head></html>`;
    const m = extractListingMetadata(html, 'https://shopee.co.id/x-i.1.2');
    expect(m).toEqual({
      title: 'Tas Rotan Bali & Kulit',
      description: null,
      price: 125000,
      currency: 'IDR',
      seller: null,
      images: ['https://down-id.img.susercontent.com/file/a.jpg', 'https://shopee.co.id/relative/b.jpg'],
    });
  });

  it('reads JSON-LD Product including seller', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Product',
          name: 'Vas Keramik Kasongan',
          image: [{ url: 'https://images.tokopedia.net/img/v.jpg' }],
          offers: { '@type': 'Offer', price: '89000', priceCurrency: 'IDR', seller: { name: 'Gerabah Kasongan' } },
        },
      ],
    })}</script>`;
    const m = extractListingMetadata(html, 'https://www.tokopedia.com/a/b');
    expect(m.title).toBe('Vas Keramik Kasongan');
    expect(m.price).toBe(89000);
    expect(m.seller).toBe('Gerabah Kasongan');
    expect(m.images).toEqual(['https://images.tokopedia.net/img/v.jpg']);
  });

  it('never invents values: missing fields stay null', () => {
    const m = extractListingMetadata('<html><title>Login</title></html>', 'https://shopee.co.id/');
    expect(m).toEqual({ title: null, description: null, price: null, currency: null, seller: null, images: [] });
  });

  it('does not guess human-formatted prices or prices without currency', () => {
    const a = extractListingMetadata(
      '<meta property="product:price:amount" content="Rp125.000"><meta property="product:price:currency" content="IDR">',
      'https://x.com',
    );
    expect(a.price).toBeNull();
    const b = extractListingMetadata('<meta property="product:price:amount" content="125000">', 'https://x.com');
    expect(b.price).toBeNull();
  });

  it('ignores non-https images and broken JSON-LD', () => {
    const m = extractListingMetadata(
      '<meta property="og:image" content="http://insecure/a.jpg"><script type="application/ld+json">{bad</script>',
      'https://shopee.co.id/',
    );
    expect(m.images).toEqual([]);
  });
});

describe('robots.txt', () => {
  const txt = `
User-agent: *
Disallow: /cart
Disallow: /*.json$
Allow: /product/

User-agent: BadBot
Disallow: /
`;
  it('applies the * group to our agent', () => {
    const r = parseRobots(txt, 'AR-LOKAL-Preview/0.1');
    expect(isPathAllowed(r, '/product/1/2')).toBe(true);
    expect(isPathAllowed(r, '/cart/x')).toBe(false);
    expect(isPathAllowed(r, '/data.json')).toBe(false);
    expect(isPathAllowed(r, '/data.json?x=1')).toBe(true);
  });
  it('a disallow-all group for us blocks everything', () => {
    const r = parseRobots('User-agent: ar-lokal\nDisallow: /\n', 'AR-LOKAL-Preview/0.1');
    expect(isPathAllowed(r, '/product/1/2')).toBe(false);
  });
  it('longest match wins', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\nAllow: /Tas-\n', 'x');
    expect(isPathAllowed(r, '/Tas-Rotan-i.1.2')).toBe(true);
    expect(isPathAllowed(r, '/search')).toBe(false);
  });
});
