// prisma.config.ts
import "dotenv/config"
import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // ← ここは "datasource"（単数形）
  datasource: {
    // DATABASE_URL があればそれを使う / なければ SQLite のファイルにフォールバック
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
})
