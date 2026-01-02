// scripts/seed-owner.ts
import "dotenv/config"
import { prisma } from "../src/server/db/client.ts"

async function main() {
  const id = process.env.OWNER_USER_ID ?? "owner-test-001"

  await prisma.user.upsert({
    where: { id },
    update: {},
    create: {
      id,
      name: "owner",
    },
  })

  console.warn("seeded user:", id)
}

main().finally(async () => {
  await prisma.$disconnect()
})
