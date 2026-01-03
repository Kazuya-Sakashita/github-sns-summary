// vitest.db.config.ts （DBあり：SQLite保護）
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,

    // DBを触るテストだけ対象（例：route.test.ts）
    include: ["src/**/?(*.)route.test.ts"],

    // ★ここだけ setup.ts を使う
    setupFiles: ["src/test/setup.ts"],

    // ★SQLite + force-reset の衝突回避
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
  },
})
