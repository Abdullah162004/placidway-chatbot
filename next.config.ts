import type { NextConfig } from 'next';

const config: NextConfig = {
  outputFileTracingIncludes: { '/api/**': ['./data/kb.json'] },
};

export default config;
