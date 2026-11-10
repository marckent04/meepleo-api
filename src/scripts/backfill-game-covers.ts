/**
 * One-shot backfill of the box cover image of the games whose sheet was
 * aggregated before the cover was collected (`image_url` still null).
 *
 *   pnpm games:backfill-covers --dry-run --limit 5
 *   pnpm games:backfill-covers --concurrency 3
 *   pnpm games:backfill-covers --dry-run --bgg-id 40398 --bgg-id 13
 *
 * For each game, Claude searches the web for the box cover image URL (a
 * short lookup, much cheaper than a sheet generation); the URL is kept only
 * when it is an absolute http(s) URL that actually serves an image.
 * Replayable: games that already have a cover are skipped, and a cover set
 * in the meantime is never overwritten.
 */
import { parseArgs } from 'node:util'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ConfigType } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { z } from 'zod'
import { AppModule } from '@/app.module'
import {
  ANTHROPIC_CLIENT,
  cachedSystemPrompt,
  httpUrlOrNull,
} from '@/infrastructure/adapters/anthropic'
import { PrismaService } from '@/infrastructure/database/prisma.service'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ANTHROPIC_CONFIG } from '@/shared/config'

type Outcome = 'filled' | 'notFound' | 'failed'

type GameToCover = {
  id: string
  bggId: number | null
  name: string
  year: number | null
  publisher: string | null
  edition: string | null
  /** `{ "<language code>": "<title>" }` */
  localizedNames: unknown
}

const MAX_TOKENS = 4_000
/** Maximum retries when the server tool loop is interrupted (`pause_turn`). */
const MAX_CONTINUATIONS = 3
const IMAGE_CHECK_TIMEOUT_MS = 10_000

/** A cover lookup needs more effort than a barcode lookup to open product pages. */
const EFFORT = 'medium'

const WEB_TOOLS: Anthropic.ToolUnion[] = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 6 },
  {
    type: 'web_fetch_20250910',
    name: 'web_fetch',
    max_uses: 6,
    max_content_tokens: 20_000,
  },
]

const CoverOutputSchema = z.object({
  image_url: z
    .string()
    .describe(
      'URL of the box cover image, copied from a page you saw; empty string when unknown',
    ),
})
const OUTPUT_FORMAT = zodOutputFormat(CoverOutputSchema)

const SYSTEM_PROMPT = `You find the box cover image of a board game, for Meepleo, an app that helps people play board games at the table.

You receive a board game (name, localized titles, BoardGameGeek id, year, publisher, edition when known). Find the URL of an image of the front of its box.

Method:
1. Search for the game's product page with several queries: the name, then each localized title, each followed by words such as "box", "board game" or "card game" (or their equivalent in that language, e.g. "jeu de société", "boîte").
2. Open product pages with web fetch and take the main product image: the box cover, usually the first large image of the page (its og:image, or the first product image). Good sources, in this order:
   - hobby game retailers: Philibert, Ludum, Ludifolie, Esprit Jeu, Miniature Market, Zatu, Board Game Prices;
   - mass-market retailers, especially for mass-market games (e.g. Hasbro, Mattel, Asmodee family games): Fnac, Cultura, JouéClub, King Jouet, Smyths Toys, Target, Walmart;
   - the publisher's page;
   - Wikipedia / Wikimedia Commons.
   Mass-market publisher sites and Amazon often render their images with JavaScript or block automated access: do not insist on them.
3. BoardGameGeek pages cannot be fetched (they block automated access): never open them. A BoardGameGeek image URL (https://cf.geekdo-images.com/...) seen in a search result is fine.
4. When a fetch fails, is blocked or shows no image URL, move on to another site right away. Use all your searches and fetches before giving up.

Rules:
- image_url: the absolute https URL of an image file (not of a web page, not a logo, banner or placeholder), copied exactly as it appears in a page you opened or a search result.
- The image must show the box of this game, not of an expansion, a spin-off or a similarly named game (e.g. "Monopoly Deal" is the card game, not the "Monopoly" board game).
- Prefer the cover of the given edition; when you cannot find it, the cover of another edition or printing of the same game is acceptable.
- Never build or guess an image URL from a pattern. Return an empty string only if you found no acceptable image.`

/** One "<language code>: <title>" line per localized title. */
function localizedTitles(localizedNames: unknown): string[] {
  if (!localizedNames || typeof localizedNames !== 'object') return []
  return Object.entries(localizedNames)
    .filter(([, title]) => typeof title === 'string' && title.trim())
    .map(([language, title]) => `${language}: ${title}`)
}

function buildUserPrompt(game: GameToCover): string {
  const titles = localizedTitles(game.localizedNames)
  return [
    `Name: ${game.name}`,
    titles.length > 0 ? `Localized titles:\n${titles.join('\n')}` : null,
    game.bggId ? `BoardGameGeek id: ${game.bggId}` : null,
    game.year ? `Year: ${game.year}` : null,
    game.publisher ? `Publisher: ${game.publisher}` : null,
    game.edition ? `Edition: ${game.edition}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** True when the URL answers with an image content type. */
async function servesImage(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(IMAGE_CHECK_TIMEOUT_MS),
    })
    await response.body?.cancel()
    const type = response.headers.get('content-type') ?? ''
    return response.ok && type.startsWith('image/')
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      concurrency: { type: 'string', default: '3' },
      limit: { type: 'string' },
      'bgg-id': { type: 'string', multiple: true },
      'dry-run': { type: 'boolean', default: false },
    },
  })
  const bggIds = (values['bgg-id'] ?? []).map((value) => {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`Invalid BGG id: "${value}"`)
    }
    return id
  })
  const concurrency = Math.max(1, Number(values.concurrency) || 1)
  const limit = values.limit ? Math.max(1, Number(values.limit)) : undefined
  const dryRun = values['dry-run']

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  })
  app.enableShutdownHooks()
  const prisma = app.get(PrismaService)
  const client = app.get<Anthropic>(ANTHROPIC_CLIENT)
  const config = app.get<ConfigType<typeof ANTHROPIC_CONFIG>>(
    ANTHROPIC_CONFIG.KEY,
  )
  const logger = await app.resolve(LoggerService)
  logger.setContext('BackfillGameCovers')

  const request = (messages: Anthropic.MessageParam[]) =>
    client.messages.parse({
      model: config.barcodeModel,
      max_tokens: MAX_TOKENS,
      system: cachedSystemPrompt(SYSTEM_PROMPT),
      messages,
      tools: WEB_TOOLS,
      output_config: { effort: EFFORT, format: OUTPUT_FORMAT },
    })

  /** `imageUrl` is null when none was found; `candidate` is what Claude gave. */
  const findCover = async (
    game: GameToCover,
  ): Promise<{ imageUrl: string | null; candidate: string }> => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: buildUserPrompt(game) },
    ]
    let response = await request(messages)
    for (let i = 0; response.stop_reason === 'pause_turn'; i++) {
      if (i >= MAX_CONTINUATIONS) {
        throw new Error('Too many pause_turn continuations')
      }
      messages.push({ role: 'assistant', content: response.content })
      response = await request(messages)
    }
    if (response.stop_reason !== 'end_turn' || !response.parsed_output) {
      throw new Error(`Cover lookup failed (${response.stop_reason})`)
    }
    const candidate = response.parsed_output.image_url
    const url = httpUrlOrNull(candidate)
    const imageUrl = url && (await servesImage(url)) ? url : null
    return { imageUrl, candidate }
  }

  try {
    // Aggregated = the sheet exists in at least one language.
    const games: GameToCover[] = await prisma.game.findMany({
      where: {
        deletedAt: null,
        imageUrl: null,
        supportedLanguages: { isEmpty: false },
        ...(bggIds.length > 0 && { bggId: { in: bggIds } }),
      },
      select: {
        id: true,
        bggId: true,
        name: true,
        year: true,
        publisher: true,
        edition: true,
        localizedNames: true,
      },
      orderBy: { name: 'asc' },
      take: limit,
    })
    logger.info(
      {
        games: games.length,
        dryRun,
        model: config.barcodeModel,
        effort: EFFORT,
      },
      'Backfilling game covers',
    )

    const counts: Record<Outcome, number> = {
      filled: 0,
      notFound: 0,
      failed: 0,
    }
    const queue = [...games]
    const worker = async () => {
      for (let game = queue.shift(); game; game = queue.shift()) {
        try {
          const { imageUrl, candidate } = await findCover(game)
          if (!imageUrl) {
            counts.notFound++
            logger.warn(
              { ...game, candidate },
              candidate
                ? 'Cover URL rejected: not an http(s) URL serving an image'
                : 'No cover found by the lookup',
            )
            continue
          }
          if (!dryRun) {
            // Never overwrites a cover set in the meantime (e.g. a regeneration).
            await prisma.game.updateMany({
              where: { id: game.id, imageUrl: null, deletedAt: null },
              data: { imageUrl },
            })
          }
          counts.filled++
          logger.info({ ...game, imageUrl }, 'Cover found')
        } catch (error) {
          counts.failed++
          logger.error({ ...game, err: error }, 'Cover lookup failed')
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    logger.info({ ...counts, dryRun }, 'Game cover backfill done')
    if (counts.failed > 0) process.exitCode = 1
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  process.exitCode = 1
  throw error
})
