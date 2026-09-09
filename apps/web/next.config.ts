import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@airdrop/contracts'],
  // Self-hosting ships the standalone server bundle instead of building on the
  // host, which has far too little RAM for a production `next build`. Vercel
  // builds the project itself and must not see this override, so it is opt-in.
  output: process.env.NEXT_STANDALONE === 'true' ? 'standalone' : undefined
};

export default nextConfig;
