import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { ErrorCode } from '@/shared/errors'
import type { PlayerWrite } from '@/shared/types'
import { PlayerRepository } from './player.repository'

const t1 = new Date('2026-11-12T10:00:00.000Z')
const t2 = new Date('2026-11-12T11:00:00.000Z')

const write: PlayerWrite = {
  id: 'p1',
  name: 'Léa',
  color: '#E4572E',
  shape: 'circle',
  handle: null,
  isCurrentUser: false,
  createdAt: t1,
  updatedAt: t2,
  deletedAt: null,
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    userId: 'u1',
    name: 'Léa',
    color: '#E4572E',
    shape: 'CIRCLE',
    handle: null,
    isCurrentUser: false,
    createdAt: t1,
    updatedAt: t1,
    deletedAt: null,
    revision: BigInt(4),
    ...overrides,
  }
}

function setup() {
  const { host, tx } = createTransactionHostMock({
    player: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn().mockResolvedValue(record()),
      update: vi.fn().mockResolvedValue(record()),
      updateMany: vi.fn(),
    },
  })
  return { repository: new PlayerRepository(host), model: tx.player }
}

describe('PlayerRepository', () => {
  it('creates an unknown player with the client id and dates', async () => {
    const { repository, model } = setup()

    const result = await repository.upsertLww('u1', write)

    expect(model.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'p1',
        userId: 'u1',
        shape: 'CIRCLE',
        createdAt: t1,
        updatedAt: t2,
      }),
    })
    expect(result).toMatchObject({
      status: 'ok',
      entity: { id: 'p1', shape: 'circle', revision: 4 },
    })
  })

  it('updates a player with an older stored date', async () => {
    const { repository, model } = setup()
    model.findUnique.mockResolvedValue(record())

    await repository.upsertLww('u1', write)

    expect(model.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ name: 'Léa', updatedAt: t2 }),
    })
  })

  it('reports a conflict, without writing, for an older write', async () => {
    const { repository, model } = setup()
    model.findUnique.mockResolvedValue(
      record({ updatedAt: new Date(t2.getTime() + 1) }),
    )

    const result = await repository.upsertLww('u1', write)

    expect(result.status).toBe('conflict')
    expect(model.update).not.toHaveBeenCalled()
  })

  it('replays an equal write without changing anything', async () => {
    const { repository, model } = setup()
    model.findUnique.mockResolvedValue(record({ updatedAt: t2 }))

    const result = await repository.upsertLww('u1', write)

    expect(result.status).toBe('ok')
    expect(model.update).not.toHaveBeenCalled()
  })

  it('only updates the deletion of an existing player on a tombstone', async () => {
    const { repository, model } = setup()
    model.findUnique.mockResolvedValue(record())

    await repository.upsertLww('u1', {
      ...write,
      name: '(deleted)',
      deletedAt: t2,
    })

    expect(model.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { updatedAt: t2, deletedAt: t2 },
    })
  })

  it('reports a conflict (409) for an id owned by another user', async () => {
    const { repository, model } = setup()
    model.findUnique.mockResolvedValue(record({ userId: 'other' }))

    await expect(repository.upsertLww('u1', write)).rejects.toMatchObject({
      statusCode: 409,
    })
    expect(model.update).not.toHaveBeenCalled()
  })

  it('maps a second current-user player to CURRENT_PLAYER_ALREADY_EXISTS', async () => {
    const { repository, model } = setup()
    const { Prisma } = await import('../generated/prisma/client')
    model.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['user_id'] },
      }),
    )

    await expect(
      repository.upsertLww('u1', { ...write, isCurrentUser: true }),
    ).rejects.toMatchObject({ code: ErrorCode.CURRENT_PLAYER_ALREADY_EXISTS })
  })

  it('lists live players, or the changes since a date with tombstones', async () => {
    const { repository, model } = setup()
    model.findMany.mockResolvedValue([])

    await repository.listByUser('u1')
    await repository.listByUser('u1', t1)

    expect(model.findMany.mock.calls[0][0].where).toEqual({
      userId: 'u1',
      deletedAt: null,
    })
    expect(model.findMany.mock.calls[1][0].where).toEqual({
      userId: 'u1',
      updatedAt: { gt: t1 },
    })
  })

  it('soft deletes only a live player of the user', async () => {
    const { repository, model } = setup()

    await repository.softDelete('u1', 'p1', t2)

    expect(model.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', userId: 'u1', deletedAt: null },
      data: { deletedAt: t2, updatedAt: t2, isCurrentUser: false },
    })
  })
})
