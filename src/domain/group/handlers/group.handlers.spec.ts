import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  GroupRepository,
  PlayerRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode } from '@/shared/errors'
import { UpsertGroupCommand } from '../commands'
import { UpsertGroupHandler } from './upsert-group.handler'

const userId = '0195d1a2-0000-7000-8000-000000000001'
const id = '0195d1a2-0000-7000-8000-000000000002'
const p1 = '0195d1a2-0000-7000-8000-0000000000a1'
const p2 = '0195d1a2-0000-7000-8000-0000000000a2'
const t = new Date('2026-11-12T10:00:00.000Z')

function command(overrides: { memberIds?: string[]; deletedAt?: Date } = {}) {
  return new UpsertGroupCommand({
    userId,
    id,
    name: 'Thursday',
    memberIds: [p1, p2],
    createdAt: t,
    updatedAt: t,
    ...overrides,
  })
}

describe('UpsertGroupHandler', () => {
  const groupRepository = { upsertLww: vi.fn() }
  const playerRepository = { findLiveIds: vi.fn() }
  let handler: UpsertGroupHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UpsertGroupHandler,
        { provide: GroupRepository, useValue: groupRepository },
        { provide: PlayerRepository, useValue: playerRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(UpsertGroupHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('upserts a group whose members are live players of the user', async () => {
    playerRepository.findLiveIds.mockResolvedValue(new Set([p1, p2]))
    groupRepository.upsertLww.mockResolvedValue({ status: 'ok', entity: {} })

    await handler.execute(command())

    expect(playerRepository.findLiveIds).toHaveBeenCalledWith(userId, [p1, p2])
    expect(groupRepository.upsertLww).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ id, memberIds: [p1, p2], deletedAt: null }),
    )
  })

  it('rejects a member that is not a live player of the user', async () => {
    playerRepository.findLiveIds.mockResolvedValue(new Set([p1]))

    await expect(handler.execute(command())).rejects.toMatchObject({
      code: ErrorCode.INVALID_GROUP_MEMBERS,
    })
    expect(groupRepository.upsertLww).not.toHaveBeenCalled()
  })

  it('rejects a group without members', async () => {
    await expect(
      handler.execute(command({ memberIds: [] })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_GROUP_MEMBERS })
  })

  it('applies a tombstone without checking the members', async () => {
    groupRepository.upsertLww.mockResolvedValue({ status: 'ok', entity: {} })

    await handler.execute(command({ memberIds: [], deletedAt: t }))

    expect(playerRepository.findLiveIds).not.toHaveBeenCalled()
    expect(groupRepository.upsertLww).toHaveBeenCalled()
  })
})
