/** The two seed identities shared by `pnpm db:seed`, Playwright and the guided verifications. */
export const SEED_USERS = [
  { key: 'a', name: 'Seed Fenicottero', email: 'seed-a@example.test', password: 'seed-password-1' },
  { key: 'b', name: 'Seed Ornitorinco', email: 'seed-b@example.test', password: 'seed-password-1' },
] as const;
