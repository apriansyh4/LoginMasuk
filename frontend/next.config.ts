import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Nearly every page is per-user (auth cookies); see docs/DECISIONS.md ADR-012.
  cacheComponents: false,
  poweredByHeader: false,
  output: 'standalone',
  serverExternalPackages: ['sharp'],
  experimental: {
    serverActions: { bodySizeLimit: '11mb' },
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
