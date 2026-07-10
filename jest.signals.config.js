/** Runs pre-compiled signals specs — no TS transform needed, bypasses Jest 30/Node 24 resolver issue */
module.exports = {
  displayName: 'api-signals',
  testMatch: ['<rootDir>/dist-test-signals/apps/api/src/services/signals/**/*.spec.js'],
  transform: {},
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@ghostfolio/api/(.*)$': '<rootDir>/dist-test-signals/apps/api/src/$1',
    '^@ghostfolio/common/(.*)$': '<rootDir>/dist-test-signals/libs/common/src/lib/$1'
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/']
};
