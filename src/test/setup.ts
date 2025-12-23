import { beforeAll } from "vitest"
import { execSync } from "node:child_process"

beforeAll(() => {
  // NOTE:
  // process.env.NODE_ENV が型定義で readonly 扱いになっている場合があるため、
  // ここでは書き換えない（必要なら npm script 側で NODE_ENV=test を付与する）

  // --- 環境変数（テスト用） ---
  process.env.DATABASE_URL ??= "file:./test.db"

  // retry API 用
  process.env.WEBHOOK_RETRY_API_KEY ??= "test-retry-key"
  process.env.GITHUB_WEBHOOK_SECRET ??= "test-secret"
  process.env.OWNER_USER_ID ??= "owner-test-001"

  // --- Prisma スキーマを test.db に反映 ---
  execSync("npx prisma db push --force-reset", {
    stdio: "inherit",
    env: process.env,
  })
})
