import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Both ship TypeScript sources rather than build output, so Next has to
  // compile them. @airdrop/worker is here for the cron route, which runs one
  // pass of the collection pipeline instead of hosting the long-lived worker.
  transpilePackages: ['@airdrop/contracts', '@airdrop/worker'],
  // Self-hosting ships the standalone server bundle instead of building on the
  // host, which has far too little RAM for a production `next build`. Vercel
  // builds the project itself and must not see this override, so it is opt-in.
  output: process.env.NEXT_STANDALONE === 'true' ? 'standalone' : undefined
};

export default nextConfig;
