// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import eslintConfigPrettier from "eslint-config-prettier"

const eslintConfig = defineConfig([
  // Next.js 推奨設定（Core Web Vitals 対応）
  ...nextVitals,
  // TypeScript 対応の Next.js 設定
  ...nextTs,

  // Prettier と競合するルールを無効化
  eslintConfigPrettier,

  // プロジェクト固有のルール
  {
    rules: {
      // console はエラーでなく warning にして、warn / error は許可
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // any は完全禁止ではなく warning に（必要な箇所だけ eslint-disable で許可）
      "@typescript-eslint/no-explicit-any": "warn",

      // 追加したければここにルールを足していく
      // 例: 未使用変数をもう少し厳しくする 等
      // "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // Next.js デフォルト ignore をベースにした無視パターン
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
])

export default eslintConfig
