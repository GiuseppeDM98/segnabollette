import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Placeholder values: no test may ever read .env.local or reach a real service.
    env: {
      TZ: 'Europe/Rome',
      TURSO_DATABASE_URL: 'file:vitest-unused.db',
      BETTER_AUTH_SECRET: 'vitest-secret-vitest-secret-vitest-secret-00',
      BETTER_AUTH_URL: 'http://localhost:3000',
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
