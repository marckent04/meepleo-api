import type { TransactionHost } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import type { PrismaService } from '@/infrastructure/database/prisma.service'

export type PrismaTransactionHost = TransactionHost<
  TransactionalAdapterPrisma<PrismaService>
>

/**
 * Fake TransactionHost whose `tx` only exposes the provided delegates
 * (e.g. `{ project: { findFirst: vi.fn() } }`), to test a repository
 * without a database.
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
