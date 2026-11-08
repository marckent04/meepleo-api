import { Injectable } from '@nestjs/common'
import { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import type { PrismaService } from '../prisma.service'
import { rethrowPrismaError } from '../prisma-errors'

/**
 * Barcodes the external lookup could not resolve, so they are never looked up
 * again. Permanent technical cache (no soft delete), purged by hand if needed.
 */
@Injectable()
export class BarcodeLookupMissRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  /** Whether a previous lookup of `code` found nothing. */
  async exists(code: string): Promise<boolean> {
    const record = await this.txHost.tx.barcodeLookupMiss.findUnique({
      where: { code },
      select: { id: true },
    })
    return record !== null
  }

  /** Idempotent: a barcode already recorded is ignored. */
  async record(code: string): Promise<void> {
    try {
      await this.txHost.tx.barcodeLookupMiss.createMany({
        data: [{ code }],
        skipDuplicates: true,
      })
    } catch (error) {
      rethrowPrismaError(error)
    }
  }
}
