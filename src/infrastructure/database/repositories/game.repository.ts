import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import type {
  Game,
  GameSheet,
  GameSheetStatus,
  GameSheetTranslation,
} from '@/shared/types'
import {
  type GameWithRulesRecord,
  isGameSheetAggregated,
  toGame,
  toGameSheetStatus,
  toGameSheetTranslationData,
  toGeneratedGameSheetData,
  toStoredGameSheet,
} from '../mappers'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

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

  /** Lève NotFoundError (GAME_NOT_FOUND) si le jeu n'existe pas ou est supprimé. */
  async findById(id: string): Promise<Game> {
    const record = await this.txHost.tx.game.findFirst({
      where: { id, deletedAt: null },
    })
    if (!record) throw gameNotFound(id)
    return toGame(record)
  }

  /**
   * Fiche du jeu dans `language`, ou `null` si elle n'y est pas encore
   * agrégée (absence attendue : la fiche est produite à la demande).
   * Lève NotFoundError (GAME_NOT_FOUND) si le jeu n'existe pas.
   */
  async findSheet(id: string, language: string): Promise<GameSheet | null> {
    const record = await this.findWithRules(id)
    return isGameSheetAggregated(record, language)
      ? toStoredGameSheet(record, language)
      : null
  }

  /** Lève NotFoundError (GAME_NOT_FOUND) si le jeu n'existe pas. */
  async findSheetStatus(id: string): Promise<GameSheetStatus> {
    const record = await this.txHost.tx.game.findFirst({
      where: { id, deletedAt: null },
      select: {
        sheetGeneratedAt: true,
        sheetGeneratedBy: true,
        supportedLanguages: true,
      },
    })
    if (!record) throw gameNotFound(id)
    return toGameSheetStatus(record)
  }

  /**
   * Verrouille la ligne du jeu (`SELECT … FOR UPDATE`) jusqu'à la fin de la
   * transaction en cours. N'a d'effet que dans une transaction.
   * Lève NotFoundError (GAME_NOT_FOUND) si le jeu n'existe pas.
   */
  async lockById(id: string): Promise<void> {
    const rows = await this.txHost.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM games WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`
    if (rows.length === 0) throw gameNotFound(id)
  }

  /**
   * Enregistre une fiche générée : remplace les règles existantes et fait de
   * `sheet.language` la seule langue disponible. À appeler dans une transaction.
   */
  async saveGeneratedSheet(sheet: GameSheet): Promise<void> {
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

  /** Ajoute la langue d'une traduction à la fiche existante. À appeler dans une transaction. */
  async saveTranslation(translation: GameSheetTranslation): Promise<void> {
    const current = await this.findWithRules(translation.gameId)
    const data = toGameSheetTranslationData(translation, current)
    try {
      await this.txHost.tx.game.update({
        where: { id: translation.gameId },
        data: data.game,
      })
      for (const rule of data.rules) {
        await this.txHost.tx.gameRule.update({
          where: { id: rule.id },
          data: rule.data,
        })
      }
    } catch (error) {
      rethrowPrismaError(error, { notFound: ErrorCode.GAME_NOT_FOUND })
    }
  }

  private async findWithRules(id: string): Promise<GameWithRulesRecord> {
    const record = await this.txHost.tx.game.findFirst({
      where: { id, deletedAt: null },
      include: { rules: true },
    })
    if (!record) throw gameNotFound(id)
    return record
  }
}
