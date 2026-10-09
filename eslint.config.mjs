import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '**/next-env.d.ts',
    'apps/web/public/engine/**',
    '**/playwright-report/**',
    '**/test-results/**',
  ]),
  {
    files: ['packages/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['apps/web/**/*.{js,mjs,ts,tsx}'],
    extends: [nextVitals, nextTs],
    settings: { next: { rootDir: 'apps/web' } },
  },
]);
