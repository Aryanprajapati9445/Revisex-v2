import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Integration tests share one real Postgres DB and each file's
    // beforeEach calls truncateAll(). Running test files in parallel lets
    // one file's truncate/insert race another's, causing cross-file
    // flakiness (surfaced when auth.test.ts was added alongside
    // programs.test.ts). Force sequential file execution until the suite
    // gets per-file DB isolation (e.g. transactions or separate schemas).
    fileParallelism: false,
  },
});
