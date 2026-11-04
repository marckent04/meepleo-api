/**
 * Seed idempotent, rejouable à volonté : uniquement des `upsert`.
 * Lancé par `yarn db:seed`, et après `prisma migrate deploy` dans l'étape
 * `migrate` de l'image Docker.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { loadDatabaseEnv } from '@/infrastructure/database/database.config'
import { PrismaClient } from '@/infrastructure/database/generated/prisma/client'

async function seed(prisma: PrismaClient): Promise<void> {
  // Aucune donnée de référence pour l'instant. Exemple :
  // await prisma.role.upsert({ where: { name: 'admin' }, update: {}, create: { name: 'admin' } })
  await prisma.$queryRaw`SELECT 1`
}

async function main(): Promise<void> {
  const { DATABASE_URL } = loadDatabaseEnv()
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL }),
  })
  try {
    await seed(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  process.exitCode = 1
  throw error
})
