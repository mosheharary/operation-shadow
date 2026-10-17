import path from 'node:path';
import type { NextConfig } from 'next';

// Scripts run from apps/web, so the monorepo root is two levels up.
const workspaceRoot = path.join(process.cwd(), '..', '..');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  transpilePackages: ['@operation-shadow/ai', '@operation-shadow/content', '@operation-shadow/db', '@operation-shadow/engine', '@operation-shadow/schemas', 'three'],
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // The persistent dev cache goes stale across restarts on Docker bind mounts and sends the
    // browser into a reload loop ("HMR hash mismatch"); dev compiles from scratch instead.
    turbopackFileSystemCacheForDev: false,
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Model files carry a content hash in their names (tools/media/models.ts), so they never change.
      { source: '/media/models/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};

export default nextConfig;
