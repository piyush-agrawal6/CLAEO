import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    // Node by default; component tests opt into jsdom via a docblock:
    // // @vitest-environment jsdom
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e/**"],
    // Embedded PostgreSQL (PGlite) init + migrations can exceed the defaults
    // on slower machines; generous timeouts keep the suite reliable.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      AI_MOCK_MODE: "true",
      DATAFORSEO_MOCK_MODE: "true",
    },
  },
});
