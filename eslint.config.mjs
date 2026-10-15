import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: { next: { rootDir: 'apps/web/' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Node tooling scripts (not part of the app bundle).
    files: ['tools/**/*.mjs'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '**/next-env.d.ts',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'samples/**',
    'packages/db/migrations/**',
  ]),
]);
