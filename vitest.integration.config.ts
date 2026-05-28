import { defineConfig } from "vitest/config";

// Integration tests hit the live Chess.com API. They are intentionally NOT part
// of `npm test` or CI (network, rate limits, third-party availability). Run them
// on demand with `npm run test:integration`.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
