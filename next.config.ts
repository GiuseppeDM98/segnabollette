import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Why: `next dev` otherwise appends a generated block to AGENTS.md on every run; this repo's
  // AGENTS.md is a hand-maintained contract.
  agentRules: false,
  // Why: webpack cannot bundle unpdf's bare import.meta (a «Critical dependency» warning); Node
  // loads it from node_modules instead.
  serverExternalPackages: ['unpdf'],
};

export default nextConfig;
