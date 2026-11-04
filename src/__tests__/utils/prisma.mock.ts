import type { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import type { PrismaService } from '@/infrastructure/database/prisma.service'

export type PrismaTransactionHost = TransactionHost<
  TransactionalAdapterPrisma<PrismaService>
>

/**
 * Faux TransactionHost dont `tx` expose uniquement les délégués fournis
 * (ex. `{ project: { findFirst: vi.fn() } }`), pour tester un repository
 * sans base de données.
 */
export function createTransactionHostMock<TTx extends object>(
  tx: TTx,
): { host: PrismaTransactionHost; tx: TTx } {
  const host = {
    tx,
    withTransaction: vi.fn((callback: () => unknown) => callback()),
  }
  return { host: host as unknown as PrismaTransactionHost, tx }
}
