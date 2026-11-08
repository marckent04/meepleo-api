import { CommandHandler } from '@nestjs/cqrs'
import { Transactional } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import {
  BarcodeLookupMissRepository,
  GameBarcodeRepository,
  GameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import {
  GameBarcodeLookup,
  type GameSearchResult,
  type IdentifiedGame,
} from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { FindGamesByBarcodeCommand } from '../commands'

@CommandHandler(FindGamesByBarcodeCommand)
export class FindGamesByBarcodeHandler extends AppCommandHandler<
  FindGamesByBarcodeCommand,
  GameSearchResult[]
> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly gameBarcodeRepository: GameBarcodeRepository,
    private readonly barcodeLookupMissRepository: BarcodeLookupMissRepository,
    private readonly gameBarcodeLookup: GameBarcodeLookup,
    logger: LoggerService,
  ) {
    super(logger, 'user', FindGamesByBarcodeCommand.name)
    this.logger.setContext(FindGamesByBarcodeHandler.name)
  }

  async handle({
    code,
    language,
  }: FindGamesByBarcodeCommand): Promise<GameSearchResult[]> {
    // Our database first: the external lookup is slow and costly.
    const known = await this.gameBarcodeRepository.findGameByCode(
      code,
      language,
    )
    if (known) return [known]
    if (await this.barcodeLookupMissRepository.exists(code)) return []

    // Outside any transaction: the external call is long.
    const games = await this.gameBarcodeLookup.findByBarcode(code, language)
    if (games.length === 0) {
      await this.barcodeLookupMissRepository.record(code)
      this.logger.info({ barcode: code }, 'Barcode not found')
      return []
    }
    return this.save(code, language, games)
  }

  /**
   * Short transaction (no external call). Unknown games are created. With a
   * single game, the barcode is linked to it and its name in `language` is
   * saved if missing; with several, the barcode is ambiguous and not linked.
   */
  @Transactional<TransactionalAdapterPrisma>()
  private async save(
    code: string,
    language: string,
    games: IdentifiedGame[],
  ): Promise<GameSearchResult[]> {
    const bggIds = games.map((game) => game.bggId)
    const existing = await this.gameRepository.findIdsByBggIds(bggIds)
    const existingBggIds = new Set(existing.map((game) => game.bggId))
    const created = games.filter((game) => !existingBggIds.has(game.bggId))
    await this.gameRepository.createFromIdentification(created)

    const ids =
      created.length === 0
        ? existing
        : await this.gameRepository.findIdsByBggIds(bggIds)

    const [game] = games
    if (games.length === 1 && ids.length === 1) {
      const { id } = ids[0]
      if (game.localizedName) {
        await this.gameRepository.addLocalizedNameIfMissing(
          id,
          language,
          game.localizedName,
        )
      }
      await this.gameBarcodeRepository.attach(code, id)
    }

    this.logger.info(
      {
        barcode: code,
        bggIds,
        createdBggIds: created.map((g) => g.bggId),
        linked: games.length === 1 && ids.length === 1,
      },
      'Barcode resolved',
    )
    return this.gameRepository.findSearchResultsByIds(
      ids.map((entry) => entry.id),
      language,
    )
  }
}
