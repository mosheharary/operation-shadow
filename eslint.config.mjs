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
    // three.js scene objects are imperative: R3F code creates them once and mutates them inside
    // useFrame callbacks, which is the documented R3F pattern. The React Compiler is not enabled,
    // so its immutability analysis would only flag that intended mutation.
    files: ['apps/web/src/game/render/**/*.tsx', 'apps/web/src/game/input/**/*.tsx', 'apps/web/src/game/camera/**/*.tsx'],
    rules: { 'react-hooks/immutability': 'off' },
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
