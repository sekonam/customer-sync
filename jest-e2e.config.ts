export default {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/e2e/**/*.test.ts"],
  testTimeout: 30000,
  maxWorkers: 1, // Run tests sequentially for e2e
  verbose: true,
  setupFiles: ["<rootDir>/tests/e2e/setup.ts"],
};
