// ESLint flat config. In the full monorepo this lives in the shared `@org/eslint-config` project.
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const COMPOSITION = [
  'src/main.ts',
  'src/instrumentation.ts',
  'src/migrate.ts',
  'src/*.module.ts',
  'src/*/*.module.ts',
];

const FRAMEWORK_AND_IO = [
  'drizzle-orm',
  'drizzle-orm/*',
  'pg',
  'postgres',
  'amqplib',
  '@golevelup/*',
  'cockatiel',
  'nestjs-pino',
  'pino',
  'fastify',
  '@opentelemetry/*',
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'drizzle/**',
      '*.config.js',
      'eslint.config.mjs',
      '.dependency-cruiser.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'import-x': importX, boundaries },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
      'import/resolver': { typescript: { project: './tsconfig.json' }, node: true },
      'boundaries/include': ['src/**/*.ts'],
      // Layers per bounded context: src/<context>/{domain,application,infrastructure}
      // Composition roots (wire everything; nothing may import them).
      'boundaries/ignore': COMPOSITION,
      'boundaries/elements': [
        { type: 'shared-kernel', pattern: 'src/shared/kernel' },
        { type: 'shared-infrastructure', pattern: 'src/shared/infrastructure' },
        { type: 'domain', pattern: 'src/*/domain', capture: ['context'] },
        { type: 'application', pattern: 'src/*/application', capture: ['context'] },
        { type: 'infrastructure', pattern: 'src/*/infrastructure', capture: ['context'] },
      ],
    },
    rules: {
      // --- Standards §1 ---
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import-x/no-cycle': 'error',
      'no-console': 'error',
      // --- Standards §2: hexagonal layering (infrastructure -> application -> domain) ---
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'shared-kernel' } },
              allow: { to: { element: { type: ['shared-kernel'] } } },
            },
            {
              from: { element: { type: 'domain' } },
              allow: { to: { element: { type: ['domain', 'shared-kernel'] } } },
            },
            {
              from: { element: { type: 'application' } },
              allow: { to: { element: { type: ['application', 'domain', 'shared-kernel'] } } },
            },
            {
              from: { element: { type: 'infrastructure' } },
              allow: {
                to: {
                  element: {
                    type: [
                      'infrastructure',
                      'application',
                      'domain',
                      'shared-kernel',
                      'shared-infrastructure',
                    ],
                  },
                },
              },
            },
            {
              from: { element: { type: 'shared-infrastructure' } },
              allow: { to: { element: { type: ['shared-infrastructure', 'shared-kernel'] } } },
            },
          ],
        },
      ],
      // --- Standards §5/§8: no raw SQL string building ---
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='sql'][property.name='raw']",
          message: 'sql.raw() is banned; use the sql`` template tag.',
        },
      ],
    },
  },
  {
    files: ['src/*/domain/**/*.ts', 'src/shared/kernel/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', ...FRAMEWORK_AND_IO, 'zod'],
              message: 'Domain must be pure TypeScript.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', { name: 'process', message: 'No process.env in domain.' }],
    },
  },
  {
    files: ['src/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...FRAMEWORK_AND_IO,
                '@nestjs/core',
                '@nestjs/platform-*',
                '@nestjs/terminus',
              ],
              message: 'Application layer depends on ports only.',
            },
          ],
          paths: [
            {
              name: '@nestjs/common',
              allowImportNames: ['Injectable', 'Inject'],
              message: 'Only @Injectable/@Inject allowed in application.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.spec.ts', 'src/**/*.int-spec.ts', 'test/**/*.ts'],
    rules: {
      'boundaries/dependencies': 'off',
      'boundaries/no-unknown-files': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  prettier,
);
