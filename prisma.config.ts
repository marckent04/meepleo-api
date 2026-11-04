import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'
import { loadDatabaseEnv } from './src/infrastructure/database/database.config'

// La CLI Prisma ne charge pas .env : on le charge ici (Node >= 21) s'il existe.
// En CI/Docker, les variables viennent de l'environnement.
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node -r tsconfig-paths/register prisma/seed.ts',
  },
  datasource: {
    url: loadDatabaseEnv().DATABASE_URL,
  },
})
