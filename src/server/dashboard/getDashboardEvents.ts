// src/server/dashboard/getDashboardEvents.ts
import { prisma } from "@/server/db/client"
import { unstable_noStore as noStore } from "next/cache"

export async function getDashboardEvents() {
  // ✅ この関数の結果を Next のキャッシュ対象にしない
  noStore()

  // ✅ env は関数内で読む（開発中の反映・安全性のため）
  const OWNER_USER_ID = process.env.OWNER_USER_ID
  if (!OWNER_USER_ID) {
    throw new Error("OWNER_USER_ID is not set. Please set OWNER_USER_ID in your .env file.")
  }

  return prisma.githubEvent.findMany({
    where: { userId: OWNER_USER_ID },
    include: {
      posts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  })
}
