// src/lib/github/verifySignature.ts
import crypto from "node:crypto"

export function verifyGithubSignature(opts: {
  secret: string
  payload: string
  signature256?: string | null
}): boolean {
  const { secret, payload } = opts
  let { signature256 } = opts

  if (!signature256) return false

  signature256 = signature256.trim()
  const [algo, sigPart] = signature256.split("=")
  const signature = sigPart?.trim()

  if (algo !== "sha256" || !signature) return false

  const hmac = crypto.createHmac("sha256", secret)
  const digest = hmac.update(payload, "utf8").digest("hex")

  const sigBuf = Buffer.from(signature, "hex")
  const digestBuf = Buffer.from(digest, "hex")

  if (sigBuf.length !== digestBuf.length) return false

  return crypto.timingSafeEqual(sigBuf, digestBuf)
}
