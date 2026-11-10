import Anthropic from '@anthropic-ai/sdk'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import type { LoggerService } from '@/infrastructure/logger/logger.service'
import type { AnthropicConfig } from '@/shared/config'
import { AiCallFailedError, ErrorCode } from '@/shared/errors'
import { AnthropicGameBarcodeLookup } from './anthropic-game-barcode-lookup'
import { GAME_BARCODE_SYSTEM_PROMPT } from './game-barcode.prompt'
import type { GameBarcodeOutput } from './game-barcode.schema'

const config: AnthropicConfig = {
  apiKey: 'test',
  sheetModel: 'claude-opus-5-5',
  sheetEffort: 'medium',
  sheetTranslationModel: 'claude-haiku-5-5',
  scoringModel: 'claude-haiku-5-5',
  barcodeModel: 'claude-sonnet-5-5',
  barcodeEffort: 'low',
}

const code = '3421272109111'

const output: GameBarcodeOutput = {
  games: [
    {
      bgg_id: 13,
      name: 'CATAN',
      localized_name: 'Catane',
      year: 1995,
      categories: ['strategy', 'strategy', 'family'],
    },
  ],
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    model: 'claude-sonnet-5-5',
    stop_reason: 'end_turn',
    stop_details: null,
    content: [{ type: 'text', text: JSON.stringify(output) }],
    parsed_output: output,
    usage: { input_tokens: 10, output_tokens: 20 },
    ...overrides,
  }
}

describe('AnthropicGameBarcodeLookup', () => {
  const parse = vi.fn()
  const client = { messages: { parse } } as unknown as Anthropic
  const lookup = new AnthropicGameBarcodeLookup(
    client,
    config,
    mockLoggerService as unknown as LoggerService,
  )

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exposes the barcode model', () => {
    expect(lookup.model).toBe('claude-sonnet-5-5')
  })

  it('identifies the games with capped web tools', async () => {
    parse.mockResolvedValue(response())

    const games = await lookup.findByBarcode(code, 'fr')

    expect(parse).toHaveBeenCalledTimes(1)
    const request = parse.mock.calls[0][0]
    expect(request).toMatchObject({
      model: 'claude-sonnet-5-5',
      system: [
        {
          type: 'text',
          text: GAME_BARCODE_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: { effort: 'low' },
    })
    expect(request.tools.map((t: { type: string }) => t.type)).toEqual([
      'web_search_20250305',
      'web_fetch_20250910',
    ])
    expect(request.messages[0].content).toBe(
      `Barcode: ${code}\nTarget language: fr`,
    )
    expect(games).toEqual([
      {
        bggId: 13,
        name: 'CATAN',
        localizedName: 'Catane',
        year: 1995,
        categories: ['strategy', 'family'],
      },
    ])
  })

  it('uses the configured effort', async () => {
    parse.mockResolvedValue(response())
    const lookup = new AnthropicGameBarcodeLookup(
      client,
      { ...config, barcodeEffort: 'medium' },
      mockLoggerService as unknown as LoggerService,
    )

    await lookup.findByBarcode(code, 'fr')

    expect(parse.mock.calls[0][0].output_config.effort).toBe('medium')
  })

  it('returns no game when the barcode is unknown', async () => {
    parse.mockResolvedValue(response({ parsed_output: { games: [] } }))

    await expect(lookup.findByBarcode(code, 'fr')).resolves.toEqual([])
  })

  it('deduplicates games and normalizes an empty localized name', async () => {
    const game = { ...output.games[0], localized_name: '' }
    parse.mockResolvedValue(
      response({ parsed_output: { games: [game, { ...game, name: 'Dup' }] } }),
    )

    const games = await lookup.findByBarcode(code, 'fr')

    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({ name: 'CATAN', localizedName: null })
  })

  it.each([
    ['a truncated output', { stop_reason: 'max_tokens' }],
    ['an unparsed output', { parsed_output: null }],
  ])('fails with GAME_BARCODE_LOOKUP_FAILED on %s', async (_, overrides) => {
    parse.mockResolvedValue(response(overrides))

    const error = await lookup.findByBarcode(code, 'fr').catch((e) => e)

    expect(error).toBeInstanceOf(AiCallFailedError)
    expect(error.code).toBe(ErrorCode.GAME_BARCODE_LOOKUP_FAILED)
  })

  it('resumes a paused server tool loop', async () => {
    const paused = response({
      stop_reason: 'pause_turn',
      content: [{ type: 'server_tool_use', id: 'srv_1', name: 'web_search' }],
      parsed_output: null,
    })
    parse.mockResolvedValueOnce(paused).mockResolvedValueOnce(response())

    await lookup.findByBarcode(code, 'fr')

    expect(parse).toHaveBeenCalledTimes(2)
    expect(parse.mock.calls[1][0].messages[1]).toEqual({
      role: 'assistant',
      content: paused.content,
    })
  })

  it('gives up after too many pause_turn continuations', async () => {
    parse.mockResolvedValue(
      response({ stop_reason: 'pause_turn', parsed_output: null }),
    )

    const error = await lookup.findByBarcode(code, 'fr').catch((e) => e)

    expect(error.code).toBe(ErrorCode.GAME_BARCODE_LOOKUP_FAILED)
    expect(parse).toHaveBeenCalledTimes(4)
  })

  it('wraps Anthropic API errors', async () => {
    parse.mockRejectedValue(
      new Anthropic.APIError(529, undefined, 'Overloaded', new Headers()),
    )

    const error = await lookup.findByBarcode(code, 'fr').catch((e) => e)

    expect(error).toBeInstanceOf(AiCallFailedError)
    expect(error.code).toBe(ErrorCode.GAME_BARCODE_LOOKUP_FAILED)
    expect(error.details).toMatchObject({ status: 529 })
  })
})
