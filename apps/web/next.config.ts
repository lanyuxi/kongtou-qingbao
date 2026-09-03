import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@airdrop/contracts'],
  // Deployment ships the standalone server bundle to production instead of
  // building there: the host has ~650MB of free RAM, far below what a
  // production `next build` needs.
  output: 'standalone'
};

export default nextConfig;
