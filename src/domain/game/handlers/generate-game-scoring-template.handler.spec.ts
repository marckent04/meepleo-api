import { Test } from '@nestjs/testing'
import { buildAiTrace } from '@/__tests__/utils/ai-trace.fixture'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { GameScoringTemplateGenerator } from '@/infrastructure/adapters/anthropic'
import {
  GameAggregationRunRepository,
  GameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import {
  AiCallFailedError,
  ErrorCode,
  GameAggregationFailedError,
} from '@/shared/errors'
import { DEFAULT_SCORING_TEMPLATE, type ScoringTemplate } from '@/shared/types'
import { GenerateGameScoringTemplateCommand } from '../commands'
import { GenerateGameScoringTemplateHandler } from './generate-game-scoring-template.handler'

// The transaction is tested end to end; here we test the sequence.
vi.mock('@nestjs-cls/transactional', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Transactional: () => () => undefined,
}))

const gameId = '0195d1a2-0000-7000-8000-000000000001'
const runId = '0195d1a2-0000-7000-8000-0000000000aa'
const sheet = { gameId, language: 'fr' }
const trace = buildAiTrace()
const template: ScoringTemplate = {
  ...DEFAULT_SCORING_TEMPLATE,
  outcome: 'lowest',
  rounds: { count: null },
  targetScore: 66,
}

describe('GenerateGameScoringTemplateHandler', () => {
  const gameRepository = { findSheet: vi.fn(), saveScoringTemplate: vi.fn() }
  const runRepository = {
    start: vi.fn(),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  }
  const generator = { model: 'claude-haiku-5-5', generate: vi.fn() }
  let handler: GenerateGameScoringTemplateHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GenerateGameScoringTemplateHandler,
        { provide: GameRepository, useValue: gameRepository },
        { provide: GameAggregationRunRepository, useValue: runRepository },
        { provide: GameScoringTemplateGenerator, useValue: generator },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(GenerateGameScoringTemplateHandler)
    runRepository.start.mockResolvedValue(runId)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const command = () =>
    new GenerateGameScoringTemplateCommand({ gameId, language: 'fr' })

  it('saves the template derived from the sheet and closes the run', async () => {
    gameRepository.findSheet.mockResolvedValue(sheet)
    generator.generate.mockResolvedValue({ result: template, trace })

    await handler.execute(command())

    expect(runRepository.start).toHaveBeenCalledWith({
      gameId,
      language: 'fr',
      operation: 'scoring',
      model: 'claude-haiku-5-5',
    })
    expect(generator.generate).toHaveBeenCalledWith(sheet)
    expect(gameRepository.saveScoringTemplate).toHaveBeenCalledWith(
      gameId,
      'fr',
      template,
    )
    expect(runRepository.recordSuccess).toHaveBeenCalledWith({
      runId,
      durationMs: expect.any(Number),
      trace,
    })
  })

  it('skips a game without a sheet in the language', async () => {
    gameRepository.findSheet.mockResolvedValue(null)

    await handler.execute(command())

    expect(runRepository.start).not.toHaveBeenCalled()
    expect(generator.generate).not.toHaveBeenCalled()
  })

  it('records an AI failure with its trace', async () => {
    gameRepository.findSheet.mockResolvedValue(sheet)
    generator.generate.mockRejectedValue(
      new AiCallFailedError({
        code: ErrorCode.GAME_SCORING_TEMPLATE_GENERATION_FAILED,
        trace,
        cause: new Error('boom'),
      }),
    )

    const error = await handler.execute(command()).catch((e) => e)

    expect(error).toBeInstanceOf(GameAggregationFailedError)
    expect(error).toMatchObject({
      operation: 'scoring',
      code: ErrorCode.GAME_SCORING_TEMPLATE_GENERATION_FAILED,
      trace,
    })
    expect(runRepository.recordFailure).toHaveBeenCalledWith({ runId, error })
    expect(gameRepository.saveScoringTemplate).not.toHaveBeenCalled()
  })

  it('does not save an inconsistent template', async () => {
    gameRepository.findSheet.mockResolvedValue(sheet)
    generator.generate.mockResolvedValue({
      result: { ...template, outcome: 'manual' },
      trace,
    })

    const error = await handler.execute(command()).catch((e) => e)

    expect(error).toMatchObject({ code: ErrorCode.INVALID_SCORING_TEMPLATE })
    expect(gameRepository.saveScoringTemplate).not.toHaveBeenCalled()
    expect(runRepository.recordFailure).toHaveBeenCalled()
  })
})
