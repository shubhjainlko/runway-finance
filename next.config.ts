import type { NextConfig } from 'next';

const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingIncludes: { '/*': ['./sample-data/*.csv'] },
  turbopack: { root: process.cwd() },
};
export default config;
