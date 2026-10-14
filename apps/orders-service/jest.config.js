/** Unit tests: domain + use cases with in-memory fakes. No Nest, DB, broker or network. */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper: { '^@org/contracts$': '<rootDir>/../../libs/contracts/src/index.ts' },
  collectCoverageFrom: ['src/**/domain/**/*.ts', 'src/**/application/**/*.ts'],
  coverageThreshold: { global: { lines: 80, branches: 70 } },
};
