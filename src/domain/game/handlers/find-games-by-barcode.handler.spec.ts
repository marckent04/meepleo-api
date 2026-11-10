import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  BarcodeLookupMissRepository,
  GameBarcodeRepository,
  GameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import {
  CQRSValidationException,
  ErrorCode,
  InternalError,
} from '@/shared/errors'
import {
  GameBarcodeLookup,
  type GameSearchResult,
  type IdentifiedGame,
} from '@/shared/types'
import { FindGamesByBarcodeCommand } from '../commands'
import { FindGamesByBarcodeHandler } from './find-games-by-barcode.handler'

vi.mock('@nestjs-cls/transactional', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nestjs-cls/transactional')>()),
  Transactional: () => () => undefined,
}))

const code = '3421272109111'
const catanId = '0195d1a2-0000-7000-8000-000000000001'
const ticketId = '0195d1a2-0000-7000-8000-000000000002'

const catan: IdentifiedGame = {
  bggId: 13,
  name: 'CATAN',
  localizedName: 'Catane',
  year: 1995,
  categories: ['strategy'],
}
const ticket: IdentifiedGame = {
  bggId: 9209,
  name: 'Ticket to Ride',
  localizedName: 'Les Aventuriers du Rail',
  year: 2004,
  categories: ['family'],
}
const catanResult: GameSearchResult = {
  id: catanId,
  name: 'Catane',
  year: 1995,
  categories: ['strategy'],
  imageUrl: null,
}
const ticketResult: GameSearchResult = {
  id: ticketId,
  name: 'Les Aventuriers du Rail',
  year: 2004,
  categories: ['family'],
  imageUrl: null,
}

describe('FindGamesByBarcodeHandler', () => {
  let handler: FindGamesByBarcodeHandler
  const gameRepository = {
    findIdsByBggIds: vi.fn(),
    createFromIdentification: vi.fn(),
    addLocalizedNameIfMissing: vi.fn(),
    findSearchResultsByIds: vi.fn(),
  }
  const gameBarcodeRepository = { findGameByCode: vi.fn(), attach: vi.fn() }
  const barcodeLookupMissRepository = { exists: vi.fn(), record: vi.fn() }
  const gameBarcodeLookup = { findByBarcode: vi.fn() }

  const execute = (params = { code, language: 'fr' }) =>
    handler.execute(new FindGamesByBarcodeCommand(params))

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FindGamesByBarcodeHandler,
        { provide: GameRepository, useValue: gameRepository },
        { provide: GameBarcodeRepository, useValue: gameBarcodeRepository },
        {
          provide: BarcodeLookupMissRepository,
          useValue: barcodeLookupMissRepository,
        },
        { provide: GameBarcodeLookup, useValue: gameBarcodeLookup },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(FindGamesByBarcodeHandler)

    gameBarcodeRepository.findGameByCode.mockResolvedValue(null)
    barcodeLookupMissRepository.exists.mockResolvedValue(false)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('answers a known barcode from the database without external lookup', async () => {
    gameBarcodeRepository.findGameByCode.mockResolvedValue(catanResult)

    await expect(execute()).resolves.toEqual([catanResult])

    expect(gameBarcodeRepository.findGameByCode).toHaveBeenCalledWith(
      code,
      'fr',
    )
    expect(barcodeLookupMissRepository.exists).not.toHaveBeenCalled()
    expect(gameBarcodeLookup.findByBarcode).not.toHaveBeenCalled()
  })

  it('answers a barcode already not found without external lookup', async () => {
    barcodeLookupMissRepository.exists.mockResolvedValue(true)

    await expect(execute()).resolves.toEqual([])

    expect(barcodeLookupMissRepository.exists).toHaveBeenCalledWith(code)
    expect(gameBarcodeLookup.findByBarcode).not.toHaveBeenCalled()
    expect(barcodeLookupMissRepository.record).not.toHaveBeenCalled()
  })

  it('records a barcode the external lookup cannot resolve', async () => {
    gameBarcodeLookup.findByBarcode.mockResolvedValue([])

    await expect(execute()).resolves.toEqual([])

    expect(gameBarcodeLookup.findByBarcode).toHaveBeenCalledWith(code, 'fr')
    expect(barcodeLookupMissRepository.record).toHaveBeenCalledWith(code)
    expect(gameRepository.createFromIdentification).not.toHaveBeenCalled()
    expect(gameBarcodeRepository.attach).not.toHaveBeenCalled()
  })

  it('does not record a miss when the external lookup fails', async () => {
    const failure = new InternalError('Lookup failed', {
      code: ErrorCode.GAME_BARCODE_LOOKUP_FAILED,
    })
    gameBarcodeLookup.findByBarcode.mockRejectedValue(failure)

    await expect(execute()).rejects.toBe(failure)

    expect(barcodeLookupMissRepository.record).not.toHaveBeenCalled()
  })

  it('links a single known game and saves its missing localized name', async () => {
    gameBarcodeLookup.findByBarcode.mockResolvedValue([catan])
    gameRepository.findIdsByBggIds.mockResolvedValue([
      { bggId: 13, id: catanId },
    ])
    gameRepository.findSearchResultsByIds.mockResolvedValue([catanResult])

    await expect(execute()).resolves.toEqual([catanResult])

    expect(gameRepository.createFromIdentification).toHaveBeenCalledWith([])
    expect(gameRepository.findIdsByBggIds).toHaveBeenCalledTimes(1)
    expect(gameRepository.addLocalizedNameIfMissing).toHaveBeenCalledWith(
      catanId,
      'fr',
      'Catane',
    )
    expect(gameBarcodeRepository.attach).toHaveBeenCalledWith(code, catanId)
    expect(gameRepository.findSearchResultsByIds).toHaveBeenCalledWith(
      [catanId],
      'fr',
    )
  })

  it('creates an unknown single game before linking it', async () => {
    gameBarcodeLookup.findByBarcode.mockResolvedValue([catan])
    gameRepository.findIdsByBggIds
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ bggId: 13, id: catanId }])
    gameRepository.findSearchResultsByIds.mockResolvedValue([catanResult])

    await expect(execute()).resolves.toEqual([catanResult])

    expect(gameRepository.createFromIdentification).toHaveBeenCalledWith([
      catan,
    ])
    expect(gameRepository.addLocalizedNameIfMissing).toHaveBeenCalledWith(
      catanId,
      'fr',
      'Catane',
    )
    expect(gameBarcodeRepository.attach).toHaveBeenCalledWith(code, catanId)
  })

  it('does not save a localized name the lookup did not find', async () => {
    gameBarcodeLookup.findByBarcode.mockResolvedValue([
      { ...catan, localizedName: null },
    ])
    gameRepository.findIdsByBggIds.mockResolvedValue([
      { bggId: 13, id: catanId },
    ])
    gameRepository.findSearchResultsByIds.mockResolvedValue([catanResult])

    await execute()

    expect(gameRepository.addLocalizedNameIfMissing).not.toHaveBeenCalled()
    expect(gameBarcodeRepository.attach).toHaveBeenCalledWith(code, catanId)
  })

  it('returns several games without linking the barcode nor saving names', async () => {
    gameBarcodeLookup.findByBarcode.mockResolvedValue([catan, ticket])
    gameRepository.findIdsByBggIds
      .mockResolvedValueOnce([{ bggId: 13, id: catanId }])
      .mockResolvedValueOnce([
        { bggId: 13, id: catanId },
        { bggId: 9209, id: ticketId },
      ])
    gameRepository.findSearchResultsByIds.mockResolvedValue([
      catanResult,
      ticketResult,
    ])

    await expect(execute()).resolves.toEqual([catanResult, ticketResult])

    expect(gameRepository.findIdsByBggIds).toHaveBeenCalledWith([13, 9209])
    expect(gameRepository.createFromIdentification).toHaveBeenCalledWith([
      ticket,
    ])
    expect(gameRepository.addLocalizedNameIfMissing).not.toHaveBeenCalled()
    expect(gameBarcodeRepository.attach).not.toHaveBeenCalled()
    expect(barcodeLookupMissRepository.record).not.toHaveBeenCalled()
    expect(gameRepository.findSearchResultsByIds).toHaveBeenCalledWith(
      [catanId, ticketId],
      'fr',
    )
  })

  it.each([
    ['a non-numeric barcode', { code: 'abc12345', language: 'fr' }],
    ['a too short barcode', { code: '1234567', language: 'fr' }],
    ['a too long barcode', { code: '123456789012345', language: 'fr' }],
    ['an invalid language', { code, language: 'xx' }],
  ])('rejects %s', async (_label, params) => {
    const error = await execute(params).catch((e) => e)

    expect(error).toBeInstanceOf(CQRSValidationException)
    expect(gameBarcodeRepository.findGameByCode).not.toHaveBeenCalled()
  })
})
