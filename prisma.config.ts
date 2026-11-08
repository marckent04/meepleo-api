import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'
import { loadDatabaseEnv } from './src/infrastructure/database/database.config'

// The Prisma CLI does not load .env: we load it here (Node >= 21) if it exists.
// In CI/Docker, variables come from the environment.
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
