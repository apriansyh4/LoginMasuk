export const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), xr-spatial-tracking=(self)',
  'cross-origin-opener-policy': 'same-origin',
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
};

/**
 * Content-Security-Policy with a per-request script nonce.
 * style-src allows 'unsafe-inline' because model-viewer and Next's font/CSS
 * injection add inline styles; scripts stay nonce-only (see docs/SECURITY.md).
 */
export function buildCsp(nonce: string, isDev: boolean, supabaseUrl?: string): string {
  let supabase = '';
  if (supabaseUrl) {
    try {
      const u = new URL(supabaseUrl);
      supabase = ` ${u.origin} ${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`;
    } catch {
      supabase = '';
    }
  }
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    // listing previews (user pasted the link): Shopee / Tokopedia image CDNs only
    `img-src 'self' blob: data: https://*.susercontent.com https://images.tokopedia.net https://*.tokopedia.net${supabase
      .split(' ')
      .filter((s) => s.startsWith('http'))
      .map((s) => ` ${s}`)
      .join('')}`,
    `font-src 'self'`,
    `connect-src 'self' blob: data:${supabase}`,
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
