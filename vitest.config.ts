import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    retry: 2,
    globals: true,
    coverage: {
      enabled: false, // opt-in via --coverage flag
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
