import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import type { GameSearchResult } from '@/shared/types'
import {
  GAME_SEARCH_RESULT_SELECT,
  toGameSearchResultFromRecord,
} from '../mappers'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

/** Barcodes (EAN / UPC) linked to a catalog game; a game may have several. */
@Injectable()
export class GameBarcodeRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /**
   * Non-deleted game linked to `code`, or `null` if the barcode is not known
   * yet (expected absence: it is then looked up externally).
   */
  async findGameByCode(
    code: string,
    language: string,
  ): Promise<GameSearchResult | null> {
    const record = await this.txHost.tx.gameBarcode.findFirst({
      where: { code, game: { deletedAt: null } },
      select: { game: { select: GAME_SEARCH_RESULT_SELECT } },
    })
    return record ? toGameSearchResultFromRecord(record.game, language) : null
  }

  /** Idempotent: a barcode already linked (to any game) is ignored. */
  async attach(code: string, gameId: string): Promise<void> {
    try {
      await this.txHost.tx.gameBarcode.createMany({
        data: [{ code, gameId }],
        skipDuplicates: true,
      })
    } catch (error) {
      rethrowPrismaError(error)
    }
  }
}
