// src/lib/github/verifySignature.ts
import { createHmac, timingSafeEqual } from "node:crypto"

export type VerifyGithubSignatureResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | "missing_header"
        | "missing_sha256_prefix"
        | "invalid_hex"
        | "invalid_hex_length"
        | "mismatch"
    }

export function verifyGithubSignature(args: {
  secret: string
  payload: string
  signature256: string | null
}): VerifyGithubSignatureResult {
  const { secret, payload, signature256 } = args

  // header 必須
  if (!signature256) return { ok: false, reason: "missing_header" }

  const header = signature256.trim()

  // "sha256=" 必須
  if (!header.toLowerCase().startsWith("sha256=")) {
    return { ok: false, reason: "missing_sha256_prefix" }
  }

  const hex = header.slice("sha256=".length).trim()

  // 16進文字のみ
  if (!/^[0-9a-fA-F]+$/.test(hex)) return { ok: false, reason: "invalid_hex" }

  // sha256 は 32bytes = 64hex
  if (hex.length !== 64) return { ok: false, reason: "invalid_hex_length" }

  const expectedHex = createHmac("sha256", secret).update(payload, "utf8").digest("hex")

  const a = Buffer.from(expectedHex, "hex")
  const b = Buffer.from(hex.toLowerCase(), "hex")

  if (a.length !== b.length) return { ok: false, reason: "mismatch" }

  const ok = timingSafeEqual(a, b)
  return ok ? { ok: true } : { ok: false, reason: "mismatch" }
}
