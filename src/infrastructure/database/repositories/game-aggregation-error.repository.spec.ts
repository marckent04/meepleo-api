import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import {
  ErrorCode,
  GameAggregationFailedError,
  InternalError,
} from '@/shared/errors'
import { GAME_ID } from '../__fixtures__/game-record.fixture'
import { GameAggregationErrorRepository } from './game-aggregation-error.repository'

describe('GameAggregationErrorRepository', () => {
  function setup() {
    const { host, tx } = createTransactionHostMock({
      gameAggregationError: { create: vi.fn() },
    })
    return { repository: new GameAggregationErrorRepository(host), tx }
  }

  it('records the operation, the model and the original cause', async () => {
    const { repository, tx } = setup()
    const cause = new InternalError('Anthropic API call failed', {
      code: ErrorCode.GAME_SHEET_TRANSLATION_FAILED,
      details: { status: 529, apiKey: 'sk-secret' },
    })

    await repository.record({
      gameId: GAME_ID,
      language: 'en',
      error: new GameAggregationFailedError({
        operation: 'translation',
        model: 'claude-haiku-5-5',
        sourceLanguage: 'fr',
        cause,
      }),
    })

    expect(tx.gameAggregationError.create).toHaveBeenCalledWith({
      data: {
        gameId: GAME_ID,
        language: 'en',
        operation: 'TRANSLATION',
        sourceLanguage: 'fr',
        model: 'claude-haiku-5-5',
        code: ErrorCode.GAME_SHEET_TRANSLATION_FAILED,
        message: 'Anthropic API call failed',
        details: {
          status: 529,
          apiKey: '[REDACTED]',
          operation: 'translation',
          model: 'claude-haiku-5-5',
          sourceLanguage: 'fr',
        },
      },
    })
  })

  it('records an error raised outside of the AI call without operation nor model', async () => {
    const { repository, tx } = setup()

    await repository.record({
      gameId: GAME_ID,
      language: 'fr',
      error: new Error('Transaction already closed'),
    })

    expect(tx.gameAggregationError.create).toHaveBeenCalledWith({
      data: {
        gameId: GAME_ID,
        language: 'fr',
        operation: null,
        sourceLanguage: null,
        model: null,
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Transaction already closed',
        details: undefined,
      },
    })
  })
})
