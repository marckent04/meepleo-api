/**
 * Seed idempotent, rejouable à volonté : uniquement des `upsert`.
 * Lancé par `yarn db:seed`, et après `prisma migrate deploy` dans l'étape
 * `migrate` de l'image Docker.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { loadDatabaseEnv } from '@/infrastructure/database/database.config'
import {
  GameCategory,
  PrismaClient,
} from '@/infrastructure/database/generated/prisma/client'

const BGG_GAMES_CSV = join(__dirname, 'data', 'bgg_games.csv')
const BATCH_SIZE = 500

/** Catégories BGG du CSV → enum `GameCategory`. */
const BGG_CATEGORIES: Record<string, GameCategory> = {
  abstracts: GameCategory.ABSTRACT,
  children: GameCategory.CHILDREN,
  family: GameCategory.FAMILY,
  party: GameCategory.PARTY,
  strategy: GameCategory.STRATEGY,
  thematic: GameCategory.THEMATIC,
  war: GameCategory.WAR,
}

interface BggGame {
  bggId: number
  name: string
  year: number | null
  categories: GameCategory[]
}

/** Lit un champ à partir de `start` ; renvoie sa valeur et l'index du séparateur qui le suit. */
function readCsvField(
  content: string,
  start: number,
): { value: string; end: number } {
  if (content[start] !== '"') {
    let end = start
    while (end < content.length && !',\r\n'.includes(content[end])) end++
    return { value: content.slice(start, end), end }
  }

  let value = ''
  let i = start + 1
  while (i < content.length) {
    if (content[i] !== '"') {
      value += content[i++]
    } else if (content[i + 1] === '"') {
      value += '"'
      i += 2
    } else {
      return { value, end: i + 1 }
    }
  }
  throw new Error('CSV invalide : guillemet non fermé')
}

/** Parse un CSV RFC 4180 (champs entre guillemets, `""` échappé, virgules et retours à la ligne dans les champs). */
function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let i = 0

  while (i < content.length) {
    const { value, end } = readCsvField(content, i)
    row.push(value)
    const separator = content[end]
    i = end + 1
    if (separator === ',') continue
    if (separator === '\r' && content[i] === '\n') i++
    rows.push(row)
    row = []
  }
  if (row.length > 0) rows.push(row)
  return rows
}

function toBggGame(record: Record<string, string>, line: number): BggGame {
  const bggId = Number(record.id)
  if (!Number.isInteger(bggId) || bggId <= 0) {
    throw new Error(`bgg_games.csv:${line} : id invalide "${record.id}"`)
  }

  // BGG met 0 quand l'année est inconnue ; une année négative est av. J.-C.
  const year = Number(record.yearpublished)
  const categories = record.category
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const category = BGG_CATEGORIES[value]
      if (!category) {
        throw new Error(`bgg_games.csv:${line} : catégorie inconnue "${value}"`)
      }
      return category
    })

  return {
    bggId,
    name: record.name.trim(),
    year: Number.isInteger(year) && year !== 0 ? year : null,
    categories: [...new Set(categories)],
  }
}

function loadBggGames(): BggGame[] {
  const [header, ...rows] = parseCsv(readFileSync(BGG_GAMES_CSV, 'utf8'))
  return rows
    .filter((row) => row.some((value) => value.trim() !== ''))
    .map((row, index) => {
      const record = Object.fromEntries(
        header.map((column, columnIndex) => [column, row[columnIndex] ?? '']),
      )
      return toBggGame(record, index + 2)
    })
}

/**
 * Jeux de base issus de BGG. Seules les colonnes venant du CSV (nom, année, catégories) sont mises à
 * jour : les données de fiche remplies par l'IA ne sont jamais écrasées.
 */
async function seedBggGames(prisma: PrismaClient): Promise<number> {
  const games = loadBggGames()
  for (let start = 0; start < games.length; start += BATCH_SIZE) {
    const batch = games.slice(start, start + BATCH_SIZE)
    await prisma.$transaction(
      batch.map(({ bggId, ...data }) =>
        prisma.game.upsert({
          where: { bggId },
          update: data,
          create: { bggId, ...data },
        }),
      ),
    )
  }
  return games.length
}

async function seed(prisma: PrismaClient): Promise<void> {
  const count = await seedBggGames(prisma)
  process.stdout.write(`Seed : ${count} jeux BGG synchronisés\n`)
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
