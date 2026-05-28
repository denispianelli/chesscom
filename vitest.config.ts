import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests are co-located in src/. Integration tests (test/integration/)
    // hit the live API and run only via `npm run test:integration`.
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "**/*.test.ts"],
    },
  },
});
