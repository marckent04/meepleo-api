import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import {
  Game,
  GameSheetTranslation,
  type GeneratedGameSheet,
} from '@/shared/types'
import { GAME_ID, gameRecord } from '../__fixtures__/game-record.fixture'
import {
  GAME_SEARCH_RESULT_SELECT,
  LATEST_GENERATION_RUN,
  toStoredGameSheet,
} from '../mappers'
import { lockGameSql, searchGamesSql } from '../queries'
import { GameRepository } from './game.repository'

const id = '0195d1a2-0000-7000-8000-000000000001'

describe('GameRepository', () => {
  it('finds a non-deleted game and maps it to the domain model', async () => {
    const { host, tx } = createTransactionHostMock({
      game: {
        findFirst: vi.fn().mockResolvedValue({
          id,
          name: 'Dnup',
          year: 2021,
          publisher: null,
          edition: null,
          bggId: 123,
          ruleBookUrl: 'https://example.com/dnup.pdf',
        }),
      },
    })

    const game = await new GameRepository(host).findById(id)

    expect(tx.game.findFirst).toHaveBeenCalledWith({
      where: { id, deletedAt: null },
    })
    expect(game).toEqual(
      new Game(
        id,
        'Dnup',
        2021,
        null,
        null,
        123,
        'https://example.com/dnup.pdf',
      ),
    )
  })

  it('finds game ids by BGG id in the requested order, skipping unknown ones', async () => {
    const other = '0195d1a2-0000-7000-8000-000000000002'
    const { host, tx } = createTransactionHostMock({
      game: {
        findMany: vi.fn().mockResolvedValue([
          { id, bggId: 123 },
          { id: other, bggId: 456 },
        ]),
      },
    })

    const games = await new GameRepository(host).findIdsByBggIds([
      456, 999, 123,
    ])

    expect(tx.game.findMany).toHaveBeenCalledWith({
      where: { bggId: { in: [456, 999, 123] }, deletedAt: null },
      select: { id: true, bggId: true },
    })
    expect(games).toEqual([
      { bggId: 456, id: other },
      { bggId: 123, id },
    ])
  })

  it('finds search results by id in the requested order, skipping unknown ones', async () => {
    const other = '0195d1a2-0000-7000-8000-000000000002'
    const { host, tx } = createTransactionHostMock({
      game: {
        findMany: vi.fn().mockResolvedValue([
          {
            id,
            name: 'CATAN',
            localizedNames: { fr: 'Catane' },
            year: 1995,
            categories: ['STRATEGY'],
          },
          {
            id: other,
            name: 'Azul',
            localizedNames: null,
            year: 2017,
            categories: [],
          },
        ]),
      },
    })
    const unknown = '0195d1a2-0000-7000-8000-000000000003'

    const results = await new GameRepository(host).findSearchResultsByIds(
      [other, unknown, id],
      'fr',
    )

    expect(tx.game.findMany).toHaveBeenCalledWith({
      where: { id: { in: [other, unknown, id] }, deletedAt: null },
      select: GAME_SEARCH_RESULT_SELECT,
    })
    expect(results).toEqual([
      { id: other, name: 'Azul', year: 2017, categories: [] },
      { id, name: 'Catane', year: 1995, categories: ['strategy'] },
    ])
  })

  it('creates identified games, ignoring existing BGG ids', async () => {
    const { host, tx } = createTransactionHostMock({
      game: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    })

    await new GameRepository(host).createFromIdentification([
      {
        bggId: 13,
        name: 'CATAN',
        localizedName: 'Catane',
        year: 1995,
        categories: ['strategy'],
      },
    ])

    expect(tx.game.createMany).toHaveBeenCalledWith({
      data: [
        { bggId: 13, name: 'CATAN', year: 1995, categories: ['STRATEGY'] },
      ],
      skipDuplicates: true,
    })
  })

  it('creates nothing without identified games', async () => {
    const { host, tx } = createTransactionHostMock({
      game: { createMany: vi.fn() },
    })

    await new GameRepository(host).createFromIdentification([])

    expect(tx.game.createMany).not.toHaveBeenCalled()
  })

  it('adds a missing localized name, keeping the other languages', async () => {
    const { host, tx } = createTransactionHostMock({
      game: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ localizedNames: { en: 'Catan' } }),
        update: vi.fn().mockResolvedValue({}),
      },
    })

    await new GameRepository(host).addLocalizedNameIfMissing(id, 'fr', 'Catane')

    expect(tx.game.findFirst).toHaveBeenCalledWith({
      where: { id, deletedAt: null },
      select: { localizedNames: true },
    })
    expect(tx.game.update).toHaveBeenCalledWith({
      where: { id },
      data: { localizedNames: { en: 'Catan', fr: 'Catane' } },
    })
  })

  it('keeps an already known localized name', async () => {
    const { host, tx } = createTransactionHostMock({
      game: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ localizedNames: { fr: 'Catane' } }),
        update: vi.fn(),
      },
    })

    await new GameRepository(host).addLocalizedNameIfMissing(
      id,
      'fr',
      'Les Colons de Catane',
    )

    expect(tx.game.update).not.toHaveBeenCalled()
  })

  it('throws GAME_NOT_FOUND when adding a name to an unknown game', async () => {
    const { host } = createTransactionHostMock({
      game: { findFirst: vi.fn().mockResolvedValue(null) },
    })

    const error = await new GameRepository(host)
      .addLocalizedNameIfMissing(id, 'fr', 'Catane')
      .catch((e) => e)

    expect(error).toBeInstanceOf(NotFoundError)
    expect(error.code).toBe(ErrorCode.GAME_NOT_FOUND)
  })

  it('throws GAME_NOT_FOUND when the game does not exist', async () => {
    const { host } = createTransactionHostMock({
      game: { findFirst: vi.fn().mockResolvedValue(null) },
    })

    const error = await new GameRepository(host).findById(id).catch((e) => e)

    expect(error).toBeInstanceOf(NotFoundError)
    expect(error.code).toBe(ErrorCode.GAME_NOT_FOUND)
  })
})

describe('GameRepository — game sheet', () => {
  const generatedAt = new Date('2026-02-01T00:00:00.000Z')
  const aggregated = gameRecord({
    supportedLanguages: ['fr'],
    aggregationRuns: [{ model: 'claude-haiku-5-5', createdAt: generatedAt }],
    description: { fr: 'Description' },
  })

  it('returns null when the sheet is not aggregated in the language', async () => {
    const { host, tx } = createTransactionHostMock({
      game: { findFirst: vi.fn().mockResolvedValue(aggregated) },
    })

    const sheet = await new GameRepository(host).findSheet(GAME_ID, 'en')

    expect(tx.game.findFirst).toHaveBeenCalledWith({
      where: { id: GAME_ID, deletedAt: null },
      include: { rules: true, aggregationRuns: LATEST_GENERATION_RUN },
    })
    expect(sheet).toBeNull()
  })

  it('returns the stored sheet when it is aggregated in the language', async () => {
    const { host } = createTransactionHostMock({
      game: { findFirst: vi.fn().mockResolvedValue(aggregated) },
    })

    const sheet = await new GameRepository(host).findSheet(GAME_ID, 'fr')

    expect(sheet).toMatchObject({
      gameId: GAME_ID,
      language: 'fr',
      description: 'Description',
      generatedBy: 'claude-haiku-5-5',
      generatedAt,
    })
  })

  it('throws GAME_NOT_FOUND when reading the sheet of a missing game', async () => {
    const { host } = createTransactionHostMock({
      game: { findFirst: vi.fn().mockResolvedValue(null) },
    })

    await expect(
      new GameRepository(host).findSheet(GAME_ID, 'fr'),
    ).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_FOUND })
  })

  it('reports the sheet status from the latest successful generation run', async () => {
    const { host, tx } = createTransactionHostMock({
      game: { findFirst: vi.fn().mockResolvedValue(aggregated) },
    })

    await expect(
      new GameRepository(host).findSheetStatus(GAME_ID),
    ).resolves.toEqual({ generated: true, supportedLanguages: ['fr'] })
    expect(tx.game.findFirst).toHaveBeenCalledWith({
      where: { id: GAME_ID, deletedAt: null },
      select: {
        supportedLanguages: true,
        aggregationRuns: LATEST_GENERATION_RUN,
      },
    })
  })

  it('reports a sheet as not generated without a successful generation run', async () => {
    const { host } = createTransactionHostMock({
      game: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...aggregated, aggregationRuns: [] }),
      },
    })

    await expect(
      new GameRepository(host).findSheetStatus(GAME_ID),
    ).resolves.toEqual({ generated: false, supportedLanguages: ['fr'] })
  })

  it('locks the game row', async () => {
    const { host, tx } = createTransactionHostMock({
      $queryRaw: vi.fn().mockResolvedValue([{ id: GAME_ID }]),
    })

    await new GameRepository(host).lockById(GAME_ID)

    expect(tx.$queryRaw).toHaveBeenCalledWith(lockGameSql(GAME_ID))
  })

  it('searches games by name and maps localized names', async () => {
    const { host, tx } = createTransactionHostMock({
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: GAME_ID,
          name: 'Catan',
          localized_name: 'Catane',
          year: 1995,
          categories: ['STRATEGY', 'FAMILY'],
        },
        {
          id,
          name: 'Catan: Seafarers',
          localized_name: null,
          year: null,
          categories: [],
        },
      ]),
    })

    const results = await new GameRepository(host).search(' CAT ', 'fr', 5)

    expect(results).toEqual([
      {
        id: GAME_ID,
        name: 'Catane',
        year: 1995,
        categories: ['strategy', 'family'],
      },
      { id, name: 'Catan: Seafarers', year: null, categories: [] },
    ])
    expect(tx.$queryRaw).toHaveBeenCalledWith(
      searchGamesSql({ text: ' CAT ', language: 'fr', limit: 5 }),
    )
  })

  it('throws GAME_NOT_FOUND when there is no row to lock', async () => {
    const { host } = createTransactionHostMock({
      $queryRaw: vi.fn().mockResolvedValue([]),
    })

    await expect(
      new GameRepository(host).lockById(GAME_ID),
    ).rejects.toMatchObject({ code: ErrorCode.GAME_NOT_FOUND })
  })

  it('replaces the rules when saving a generated sheet', async () => {
    const { host, tx } = createTransactionHostMock({
      game: {
        findFirst: vi.fn().mockResolvedValue(gameRecord()),
        update: vi.fn(),
      },
      gameRule: { deleteMany: vi.fn(), createMany: vi.fn() },
    })
    const stored = toStoredGameSheet(aggregated, 'fr')
    const sheet: GeneratedGameSheet = {
      ...stored,
      game: { ...stored.game, localizedNames: { fr: 'Dnup' } },
    }

    await new GameRepository(host).saveGeneratedSheet(sheet)

    expect(tx.gameRule.deleteMany).toHaveBeenCalledWith({
      where: { gameId: GAME_ID },
    })
    expect(tx.game.update).toHaveBeenCalledWith({
      where: { id: GAME_ID },
      data: expect.objectContaining({
        supportedLanguages: ['fr'],
        localizedNames: { fr: 'Dnup' },
      }),
    })
    expect(tx.gameRule.createMany).toHaveBeenCalledWith({ data: [] })
  })

  it('adds the language and updates the rules in one statement when saving a translation', async () => {
    const rule = {
      id: 'rule-1',
      gameId: GAME_ID,
      type: 'SETUP',
      order: 1,
      position: 0,
      playerCounts: [],
      optional: false,
      title: null,
      text: { fr: 'Mélangez.' },
      createdAt: generatedAt,
      updatedAt: generatedAt,
    }
    const { host, tx } = createTransactionHostMock({
      game: {
        findFirst: vi.fn().mockResolvedValue({ ...aggregated, rules: [rule] }),
        update: vi.fn(),
      },
      $executeRaw: vi.fn(),
    })

    await new GameRepository(host).saveTranslation(
      new GameSheetTranslation(
        GAME_ID,
        'fr',
        'en',
        'D',
        'S',
        'T',
        [],
        [{ id: 'rule-1', title: null, text: 'Shuffle.' }],
      ),
    )

    expect(tx.game.update).toHaveBeenCalledWith({
      where: { id: GAME_ID },
      data: expect.objectContaining({ supportedLanguages: ['fr', 'en'] }),
    })
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    const query = tx.$executeRaw.mock.calls[0][0]
    expect(query.sql).toContain('UPDATE game_rules')
    expect(JSON.parse(query.values[0])).toEqual([
      { id: 'rule-1', text: { fr: 'Mélangez.', en: 'Shuffle.' } },
    ])
  })
})
