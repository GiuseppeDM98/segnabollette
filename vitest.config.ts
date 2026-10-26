import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Placeholder values: no test may ever read .env.local or reach a real service.
    env: {
      TZ: 'Europe/Rome',
      TURSO_DATABASE_URL: 'file:vitest-unused.db',
      BETTER_AUTH_SECRET: 'vitest-secret-vitest-secret-vitest-secret-00',
      BETTER_AUTH_URL: 'http://localhost:3000',
    },
    // `extends: true` gives both projects the env above and the alias below. Only the tests that
    // need a browser-like `window` and `navigator` (*.dom.test.ts) pay for happy-dom.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: [...configDefaults.exclude, '**/*.dom.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['src/**/*.dom.test.ts'],
        },
      },
    ],
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
