/** Integration tests: real Postgres via Testcontainers (requires Docker). */
/** @type {import('jest').Config} */
module.exports = {
  ...require('./jest.config.js'),
  testMatch: ['**/*.int-spec.ts'],
  testTimeout: 120_000,
  collectCoverageFrom: undefined,
  coverageThreshold: undefined,
};
