import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import type { Game } from '@/shared/types'
import { toGame } from '../mappers'
import type { PrismaService } from '../prisma.service'

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
    if (!record) {
      throw new NotFoundError('Game not found', {
        code: ErrorCode.GAME_NOT_FOUND,
        details: { gameId: id },
      })
    }
    return toGame(record)
  }
}
