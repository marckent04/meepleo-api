import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import type { PrismaService } from '../prisma.service'

@Injectable()
export class HealthRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /** Vérifie que la base répond ; lève l'erreur du driver sinon. */
  async ping(): Promise<void> {
    await this.txHost.tx.$queryRaw`SELECT 1`
  }
}
