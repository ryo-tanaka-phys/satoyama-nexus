import type { NextConfig } from 'next';
const config: NextConfig = { transpilePackages: ['@satoyama/domain', '@satoyama/matching', '@satoyama/ai-review'] };
export default config;
