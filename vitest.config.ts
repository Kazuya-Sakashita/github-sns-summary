// vitest.config.ts
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    setupFiles: ["src/test/setup.ts"],
    globalSetup: ["src/test/globalSetup.db.ts"],
    environment: "node",
    globals: true,

    // SQLite の安定性優先（DB触るテストが多いなら推奨）
    fileParallelism: false,
    maxWorkers: 1,
  },
})
