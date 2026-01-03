// src/test/globalSetup.db.ts
import { execSync } from "node:child_process"

export default async function globalSetup() {
  // --- 環境変数（テスト用） ---
  process.env.DATABASE_URL ??= "file:./test.db"
  process.env.DIRECT_URL ??= process.env.DATABASE_URL

  process.env.WEBHOOK_RETRY_API_KEY ??= "test-retry-key"
  process.env.GITHUB_WEBHOOK_SECRET ??= "test-secret"
  process.env.OWNER_USER_ID ??= "owner-test-001"

  // --- Prisma スキーマを test.db に反映（✅ 1回だけ） ---
  execSync("npx prisma db push --force-reset", {
    stdio: "inherit",
    env: process.env,
  })
}
