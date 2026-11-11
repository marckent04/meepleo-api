/**
 * Idempotent seed, safe to replay: `upsert` only.
 * Run by `pnpm db:seed`, and after `prisma migrate deploy` in the
 * `migrate` step of the Docker image.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadDatabaseEnv } from "@/infrastructure/database/database.config";
import {
  GameCategory,
  PrismaClient,
} from "@/infrastructure/database/generated/prisma/client";

const BGG_GAMES_CSV = join(__dirname, "data", "bgg_games.csv");
const BATCH_SIZE = 500;
const TRANSACTION_TIMEOUT_MS = 60_000;

/** BGG categories from the CSV → `GameCategory` enum. */
const BGG_CATEGORIES: Record<string, GameCategory> = {
  abstracts: GameCategory.ABSTRACT,
  children: GameCategory.CHILDREN,
  family: GameCategory.FAMILY,
  party: GameCategory.PARTY,
  strategy: GameCategory.STRATEGY,
  thematic: GameCategory.THEMATIC,
  war: GameCategory.WAR,
};

/** Columns that only seed empty values: they may have been filled by the AI sheet generation. */
interface BggGameDetails {
  minPlayers: number | null;
  maxPlayers: number | null;
  minAge: number | null;
  minDuration: number | null;
  maxDuration: number | null;
  imageUrl: string | null;
}

interface BggGame {
  bggId: number;
  name: string;
  year: number | null;
  categories: GameCategory[];
  details: BggGameDetails;
}

/** Parses a strictly positive integer; empty, `0`, negative or malformed values give `null`. */
function toPositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return number > 0 ? number : null;
}

/** Only a 4-digit positive year is kept (empty, `0`, negative or malformed values are skipped). */
function toYear(value: string): number | null {
  const trimmed = value.trim();
  return /^[1-9]\d{3}$/.test(trimmed) ? Number(trimmed) : null;
}

/** Reads a field starting at `start`; returns its value and the index of the separator that follows. */
function readCsvField(
  content: string,
  start: number,
): { value: string; end: number } {
  if (content[start] !== '"') {
    let end = start;
    while (end < content.length && !",\r\n".includes(content[end])) end++;
    return { value: content.slice(start, end), end };
  }

  let value = "";
  let i = start + 1;
  while (i < content.length) {
    if (content[i] !== '"') {
      value += content[i++];
    } else if (content[i + 1] === '"') {
      value += '"';
      i += 2;
    } else {
      return { value, end: i + 1 };
    }
  }
  throw new Error("Invalid CSV: unclosed quote");
}

/** Parses an RFC 4180 CSV (quoted fields, escaped `""`, commas and line breaks inside fields). */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;

  while (i < content.length) {
    const { value, end } = readCsvField(content, i);
    row.push(value);
    const separator = content[end];
    i = end + 1;
    if (separator === ",") continue;
    if (separator === "\r" && content[i] === "\n") i++;
    rows.push(row);
    row = [];
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

function toBggGame(record: Record<string, string>, line: number): BggGame {
  const bggId = Number(record.id);
  if (!Number.isInteger(bggId) || bggId <= 0) {
    throw new Error(`bgg_games.csv:${line}: invalid id "${record.id}"`);
  }

  const categories = record.category
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const category = BGG_CATEGORIES[value];
      if (!category) {
        throw new Error(`bgg_games.csv:${line}: unknown category "${value}"`);
      }
      return category;
    });

  return {
    bggId,
    name: record.name.trim(),
    year: toYear(record.yearpublished),
    categories: [...new Set(categories)],
    details: {
      minPlayers: toPositiveInt(record.minPlayers),
      maxPlayers: toPositiveInt(record.maxPlayers),
      minAge: toPositiveInt(record.minimumAge),
      minDuration: toPositiveInt(record.avgDuration),
      maxDuration: toPositiveInt(record.avgDuration),
      imageUrl: record.imagePath.trim() || null,
    },
  };
}

function loadBggGames(): BggGame[] {
  const [header, ...rows] = parseCsv(readFileSync(BGG_GAMES_CSV, "utf8"));
  return rows
    .filter((row) => row.some((value) => value.trim() !== ""))
    .map((row, index) => {
      const record = Object.fromEntries(
        header.map((column, columnIndex) => [column, row[columnIndex] ?? ""]),
      );
      return toBggGame(record, index + 2);
    });
}

/**
 * Base games from BGG. Name, year and categories are always synced from the CSV. The other
 * columns (players, age, duration, image) are only filled when empty in the
 * database: sheet data filled in by the AI is never overwritten.
 */
async function seedBggGames(prisma: PrismaClient): Promise<number> {
  const games = loadBggGames();
  for (let start = 0; start < games.length; start += BATCH_SIZE) {
    const batch = games.slice(start, start + BATCH_SIZE);
    const existing = await prisma.game.findMany({
      where: { bggId: { in: batch.map((game) => game.bggId) } },
      select: {
        bggId: true,
        minPlayers: true,
        maxPlayers: true,
        minAge: true,
        minDuration: true,
        maxDuration: true,
        imageUrl: true,
      },
    });
    const existingByBggId = new Map(existing.map((game) => [game.bggId, game]));

    await prisma.$transaction(
      batch.map(({ bggId, details, ...base }) => {
        const current = existingByBggId.get(bggId);
        const missing = Object.fromEntries(
          Object.entries(details).filter(
            ([key, value]) =>
              value !== null &&
              (current === undefined ||
                current[key as keyof BggGameDetails] === null),
          ),
        );
        return prisma.game.upsert({
          where: { bggId },
          update: { ...base, ...missing },
          create: { bggId, ...base, ...missing },
        });
      }),
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }
  return games.length;
}

async function seed(prisma: PrismaClient): Promise<void> {
  const count = await seedBggGames(prisma);
  process.stdout.write(`Seed: ${count} BGG games synced\n`);
}

async function main(): Promise<void> {
  const { DATABASE_URL } = loadDatabaseEnv();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL }),
  });
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.exitCode = 1;
  throw error;
});
