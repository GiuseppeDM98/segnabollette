import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Why: `next dev` otherwise appends a generated block to AGENTS.md on every run; this repo's
  // AGENTS.md is a hand-maintained contract.
  agentRules: false,
};

export default nextConfig;
