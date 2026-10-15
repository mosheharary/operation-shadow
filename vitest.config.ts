import path from 'node:path';
import { defineConfig } from 'vitest/config';

const webSrc = path.resolve(import.meta.dirname, 'apps/web/src');

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { '@': webSrc } },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: { '@': webSrc } },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          // Integration tests share one database, so they run serially.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
