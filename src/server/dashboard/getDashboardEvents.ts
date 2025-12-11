// src/server/dashboard/getDashboardEvents.ts
import { prisma } from "@/server/db/client"

const OWNER_USER_ID = process.env.OWNER_USER_ID

export async function getDashboardEvents() {
  if (!OWNER_USER_ID) {
    throw new Error("OWNER_USER_ID is not set. Please set OWNER_USER_ID in your .env file.")
  }

  const events = await prisma.githubEvent.findMany({
    where: { userId: OWNER_USER_ID },
    include: {
      posts: {
        orderBy: { createdAt: "desc" }, // 新しい順
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  return events
}
