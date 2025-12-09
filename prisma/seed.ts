// prisma/seed.ts
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
})

const prisma = new PrismaClient({ adapter })

async function main() {
  const existing = await prisma.user.findFirst()
  if (existing) {
    console.log("User already exists:")
    console.log("id  :", existing.id)
    console.log("name:", existing.name)
    return
  }

  const user = await prisma.user.create({
    data: {
      name: "Owner",
    },
  })

  console.log("Created owner user:")
  console.log("id  :", user.id)
  console.log("name:", user.name)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
