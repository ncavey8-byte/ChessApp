import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@acc/chess-core'],
  allowedDevOrigins: ['*.devinapps.com'],
  async headers() {
    return [
      {
        source: '/engine/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
