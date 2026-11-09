import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { Inject, Injectable } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ANTHROPIC_CONFIG } from '@/shared/config'
import { AiCallFailedError, ErrorCode, InternalError } from '@/shared/errors'
import type { AiTrace, GameBarcodeLookup, IdentifiedGame } from '@/shared/types'
import {
  AiTraceRecorder,
  promptVersion,
  toAiCallSettings,
} from './ai-trace.util'
import { ANTHROPIC_CLIENT, cachedSystemPrompt } from './anthropic.client'
import {
  buildGameBarcodeUserPrompt,
  GAME_BARCODE_SYSTEM_PROMPT,
} from './game-barcode.prompt'
import { GameBarcodeOutputSchema } from './game-barcode.schema'

const MAX_TOKENS = 4_000
/** Maximum retries when the server tool loop is interrupted (`pause_turn`). */
const MAX_CONTINUATIONS = 3

/** Base variants for the same reason as in GameSheetGenerator. */
const WEB_TOOLS: Anthropic.ToolUnion[] = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
  {
    type: 'web_fetch_20250910',
    name: 'web_fetch',
    max_uses: 2,
    max_content_tokens: 20_000,
  },
]

const OUTPUT_FORMAT = zodOutputFormat(GameBarcodeOutputSchema)
const PROMPT_VERSION = promptVersion(GAME_BARCODE_SYSTEM_PROMPT, OUTPUT_FORMAT)

/**
 * Barcode lookup backed by Claude and its web tools: searches which game is
 * sold under the barcode and its BoardGameGeek id.
 */
@Injectable()
export class AnthropicGameBarcodeLookup implements GameBarcodeLookup {
  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic,
    @Inject(ANTHROPIC_CONFIG.KEY)
    private readonly config: ConfigType<typeof ANTHROPIC_CONFIG>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(AnthropicGameBarcodeLookup.name)
  }

  /** AI model used to identify the games. */
  get model(): string {
    return this.config.barcodeModel
  }

  /**
   * Throws an AiCallFailedError (GAME_BARCODE_LOOKUP_FAILED) carrying the
   * trace on failure.
   */
  async findByBarcode(
    code: string,
    language: string,
  ): Promise<IdentifiedGame[]> {
    const recorder = new AiTraceRecorder(
      this.model,
      PROMPT_VERSION,
      toAiCallSettings({
        effort: this.config.barcodeEffort,
        maxTokens: MAX_TOKENS,
        tools: WEB_TOOLS,
      }),
    )
    try {
      const games = await this.run(code, language, recorder)
      this.logTrace(code, language, recorder.trace())
      return games
    } catch (cause) {
      const trace = recorder.trace()
      this.logTrace(code, language, trace)
      throw new AiCallFailedError({
        code: ErrorCode.GAME_BARCODE_LOOKUP_FAILED,
        trace,
        cause,
      })
    }
  }

  private async run(
    code: string,
    language: string,
    recorder: AiTraceRecorder,
  ): Promise<IdentifiedGame[]> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: buildGameBarcodeUserPrompt(code, language) },
    ]

    let response = await recorder.call(() => this.request(messages))
    for (let i = 0; response.stop_reason === 'pause_turn'; i++) {
      if (i >= MAX_CONTINUATIONS) {
        throw this.failure('Too many pause_turn continuations', code, {
          stopReason: response.stop_reason,
        })
      }
      // Resuming happens on the final server_tool_use block, without a new user message.
      messages.push({ role: 'assistant', content: response.content })
      response = await recorder.call(() => this.request(messages))
    }

    if (response.stop_reason !== 'end_turn' || !response.parsed_output) {
      throw this.failure(
        'Barcode lookup output is missing or truncated',
        code,
        {
          stopReason: response.stop_reason,
          stopDetails: response.stop_details ?? null,
        },
      )
    }

    // The same game may be listed twice (e.g. two editions in a bundle).
    const byBggId = new Map<number, IdentifiedGame>()
    for (const game of response.parsed_output.games) {
      if (byBggId.has(game.bgg_id)) continue
      byBggId.set(game.bgg_id, {
        bggId: game.bgg_id,
        name: game.name,
        localizedName: game.localized_name || null,
        year: game.year,
        categories: [...new Set(game.categories)],
      })
    }
    return [...byBggId.values()]
  }

  /** The bulky raw output is only useful for debugging. */
  private logTrace(code: string, language: string, trace: AiTrace): void {
    const { rawText: _rawText, ...summary } = trace
    this.logger.info({ barcode: code, language, ...summary })
  }

  private async request(messages: Anthropic.MessageParam[]) {
    try {
      return await this.client.messages.parse({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: cachedSystemPrompt(GAME_BARCODE_SYSTEM_PROMPT),
        messages,
        tools: WEB_TOOLS,
        output_config: {
          effort: this.config.barcodeEffort,
          format: OUTPUT_FORMAT,
        },
      })
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new InternalError('Anthropic API call failed', {
          code: ErrorCode.GAME_BARCODE_LOOKUP_FAILED,
          details: { status: error.status, requestId: error.requestID },
          cause: error,
        })
      }
      throw error
    }
  }

  private failure(
    message: string,
    code: string,
    details: Record<string, unknown>,
  ): InternalError {
    return new InternalError(message, {
      code: ErrorCode.GAME_BARCODE_LOOKUP_FAILED,
      details: { barcode: code, ...details },
    })
  }
}
