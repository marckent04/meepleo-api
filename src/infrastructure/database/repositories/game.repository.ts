import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import type {
  Game,
  GameSearchResult,
  GameSheet,
  GameSheetStatus,
  GameSheetTranslation,
  GeneratedGameSheet,
  IdentifiedGame,
} from '@/shared/types'
import {
  GAME_SEARCH_RESULT_SELECT,
  type GameSearchRow,
  type GameWithRulesRecord,
  isGameSheetAggregated,
  LATEST_GENERATION_RUN,
  localized,
  toGame,
  toGameSearchResult,
  toGameSearchResultFromRecord,
  toGameSheetStatus,
  toGameSheetTranslationData,
  toGeneratedGameSheetData,
  toIdentifiedGameCreateData,
  toStoredGameSheet,
  withLanguage,
} from '../mappers'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'
import {
  lockGameSql,
  searchGamesSql,
  updateGameRuleTranslationsSql,
} from '../queries'

function gameNotFound(id: string): NotFoundError {
  return new NotFoundError('Game not found', {
    code: ErrorCode.GAME_NOT_FOUND,
    details: { gameId: id },
  })
}

@Injectable()
export class GameRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /** Throws NotFoundError (GAME_NOT_FOUND) if the game does not exist or is deleted. */
  async findById(id: string): Promise<Game> {
    const record = await this.txHost.tx.game.findFirst({
      where: { id, deletedAt: null },
    })
    if (!record) throw gameNotFound(id)
    return toGame(record)
  }

  /**
   * Non-deleted games whose canonical name or name in `language`
   * contains `text` (case and accents ignored), most relevant
   * first. See `searchGamesSql`.
   */
  async search(
    text: string,
    language: string,
    limit: number,
  ): Promise<GameSearchResult[]> {
    const rows = await this.txHost.tx.$queryRaw<GameSearchRow[]>(
      searchGamesSql({ text, language, limit }),
    )
    return rows.map(toGameSearchResult)
  }

  /**
   * Ids of the non-deleted games having these BGG identifiers, in the order of
   * `bggIds`; unknown identifiers are ignored.
   */
  async findIdsByBggIds(
    bggIds: number[],
  ): Promise<{ bggId: number; id: string }[]> {
    const records = await this.txHost.tx.game.findMany({
      where: { bggId: { in: bggIds }, deletedAt: null },
      select: { id: true, bggId: true },
    })
    const idByBggId = new Map(records.map((r) => [r.bggId, r.id]))
    return bggIds.flatMap((bggId) => {
      const id = idByBggId.get(bggId)
      return id ? [{ bggId, id }] : []
    })
  }

  /**
   * Non-deleted games as search results, in the order of `ids`; unknown ids
   * are ignored. Name in `language` when known, otherwise canonical name.
   */
  async findSearchResultsByIds(
    ids: string[],
    language: string,
  ): Promise<GameSearchResult[]> {
    const records = await this.txHost.tx.game.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: GAME_SEARCH_RESULT_SELECT,
    })
    const recordById = new Map(records.map((r) => [r.id, r]))
    return ids.flatMap((id) => {
      const record = recordById.get(id)
      return record ? [toGameSearchResultFromRecord(record, language)] : []
    })
  }

  /**
   * Creates the catalog games identified by a barcode lookup. Idempotent: a
   * game whose BGG id already exists is ignored (concurrent lookups).
   */
  async createFromIdentification(games: IdentifiedGame[]): Promise<void> {
    if (games.length === 0) return
    try {
      await this.txHost.tx.game.createMany({
        data: games.map(toIdentifiedGameCreateData),
        skipDuplicates: true,
      })
    } catch (error) {
      rethrowPrismaError(error)
    }
  }

  /**
   * Sets the game's name in `language` unless one is already known.
   * Throws NotFoundError (GAME_NOT_FOUND) if the game does not exist.
   */
  async addLocalizedNameIfMissing(
    id: string,
    language: string,
    name: string,
  ): Promise<void> {
    const record = await this.txHost.tx.game.findFirst({
      where: { id, deletedAt: null },
      select: { localizedNames: true },
    })
    if (!record) throw gameNotFound(id)
    if (localized(record.localizedNames, language)) return
    try {
      await this.txHost.tx.game.update({
        where: { id },
        data: {
          localizedNames: withLanguage(record.localizedNames, language, name),
        },
      })
    } catch (error) {
      rethrowPrismaError(error, { notFound: ErrorCode.GAME_NOT_FOUND })
    }
  }

  /**
   * Sheet of the game in `language`, or `null` if it is not yet
   * aggregated there (expected absence: the sheet is produced on demand).
   * Throws NotFoundError (GAME_NOT_FOUND) if the game does not exist.
   */
  async findSheet(id: string, language: string): Promise<GameSheet | null> {
    const record = await this.findWithRules(id)
    return isGameSheetAggregated(record, language)
      ? toStoredGameSheet(record, language)
      : null
  }

  /** Throws NotFoundError (GAME_NOT_FOUND) if the game does not exist. */
  async findSheetStatus(id: string): Promise<GameSheetStatus> {
    const record = await this.txHost.tx.game.findFirst({
      where: { id, deletedAt: null },
      select: {
        supportedLanguages: true,
        aggregationRuns: LATEST_GENERATION_RUN,
      },
    })
    if (!record) throw gameNotFound(id)
    return toGameSheetStatus(record)
  }

  /**
   * Locks the game row (`SELECT … FOR UPDATE`) until the end of the
   * current transaction. Only has an effect inside a transaction.
   * Throws NotFoundError (GAME_NOT_FOUND) if the game does not exist.
   */
  async lockById(id: string): Promise<void> {
    const rows = await this.txHost.tx.$queryRaw<{ id: string }[]>(
      lockGameSql(id),
    )
    if (rows.length === 0) throw gameNotFound(id)
  }

  /**
   * Saves a generated sheet: replaces the existing rules and makes
   * `sheet.language` the only available language. To call in a transaction,
   * together with saving the generation run that marks the sheet as generated.
   */
  async saveGeneratedSheet(sheet: GeneratedGameSheet): Promise<void> {
    const current = await this.findWithRules(sheet.gameId)
    const data = toGeneratedGameSheetData(sheet, current)
    try {
      await this.txHost.tx.gameRule.deleteMany({
        where: { gameId: sheet.gameId },
      })
      await this.txHost.tx.game.update({
        where: { id: sheet.gameId },
        data: data.game,
      })
      await this.txHost.tx.gameRule.createMany({ data: data.rules })
    } catch (error) {
      rethrowPrismaError(error, { notFound: ErrorCode.GAME_NOT_FOUND })
    }
  }

  /** Adds a translation's language to the existing sheet. To call in a transaction. */
  async saveTranslation(translation: GameSheetTranslation): Promise<void> {
    const current = await this.findWithRules(translation.gameId)
    const data = toGameSheetTranslationData(translation, current)
    try {
      await this.txHost.tx.game.update({
        where: { id: translation.gameId },
        data: data.game,
      })
      if (data.rules.length > 0) {
        await this.txHost.tx.$executeRaw(
          updateGameRuleTranslationsSql(
            data.rules.map(({ id, data: rule }) => ({
              id,
              text: rule.text,
              title: rule.title,
            })),
          ),
        )
      }
    } catch (error) {
      rethrowPrismaError(error, { notFound: ErrorCode.GAME_NOT_FOUND })
    }
  }

  private async findWithRules(id: string): Promise<GameWithRulesRecord> {
    const record = await this.txHost.tx.game.findFirst({
      where: { id, deletedAt: null },
      include: { rules: true, aggregationRuns: LATEST_GENERATION_RUN },
    })
    if (!record) throw gameNotFound(id)
    return record
  }
}
