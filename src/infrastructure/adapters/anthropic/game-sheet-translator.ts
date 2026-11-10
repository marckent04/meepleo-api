import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { Inject, Injectable } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ANTHROPIC_CONFIG } from '@/shared/config'
import { AiCallFailedError, ErrorCode, InternalError } from '@/shared/errors'
import {
  type AiTrace,
  type Game,
  type GameSheet,
  GameSheetTranslation,
  type Traced,
} from '@/shared/types'
import {
  AiTraceRecorder,
  promptVersion,
  toAiCallSettings,
} from './ai-trace.util'
import { ANTHROPIC_CLIENT, cachedSystemPrompt } from './anthropic.client'
import {
  buildGameSheetTranslationUserPrompt,
  GAME_SHEET_TRANSLATION_SYSTEM_PROMPT,
  listSourceRules,
} from './game-sheet-translation.prompt'
import {
  type GameSheetTranslationOutput,
  GameSheetTranslationOutputSchema,
} from './game-sheet-translation.schema'

const MAX_TOKENS = 16_000
const EFFORT = 'low'

const OUTPUT_FORMAT = zodOutputFormat(GameSheetTranslationOutputSchema)
const PROMPT_VERSION = promptVersion(
  GAME_SHEET_TRANSLATION_SYSTEM_PROMPT,
  OUTPUT_FORMAT,
)
const SETTINGS = toAiCallSettings({ effort: EFFORT, maxTokens: MAX_TOKENS })

/**
 * Translates an existing sheet into another language, without web tools:
 * the rules stay identical from one language to the other, and the game's
 * titles are collected during the generation (`alternativeNames`).
 */
@Injectable()
export class GameSheetTranslator {
  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic,
    @Inject(ANTHROPIC_CONFIG.KEY)
    private readonly config: ConfigType<typeof ANTHROPIC_CONFIG>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(GameSheetTranslator.name)
  }

  /** AI model used to translate the sheets. */
  get model(): string {
    return this.config.sheetTranslationModel
  }

  /**
   * Throws an AiCallFailedError carrying the trace (tokens consumed, raw
   * output…) on failure, including when the translation is incomplete.
   */
  async translate(
    game: Game,
    sheet: GameSheet,
    targetLanguage: string,
  ): Promise<Traced<GameSheetTranslation>> {
    const recorder = new AiTraceRecorder(this.model, PROMPT_VERSION, SETTINGS)
    try {
      const result = await this.run(game, sheet, targetLanguage, recorder)
      const trace = recorder.trace()
      this.logTrace(sheet, targetLanguage, trace)
      return { result, trace }
    } catch (cause) {
      const trace = recorder.trace()
      this.logTrace(sheet, targetLanguage, trace)
      throw new AiCallFailedError({
        code: ErrorCode.GAME_SHEET_TRANSLATION_FAILED,
        trace,
        cause,
      })
    }
  }

  private async run(
    game: Game,
    sheet: GameSheet,
    targetLanguage: string,
    recorder: AiTraceRecorder,
  ): Promise<GameSheetTranslation> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: buildGameSheetTranslationUserPrompt(
          game,
          sheet,
          targetLanguage,
        ),
      },
    ]

    const response = await recorder.call(() => this.request(messages))

    if (response.stop_reason !== 'end_turn' || !response.parsed_output) {
      throw this.failure('Translation output is missing or truncated', sheet, {
        stopReason: response.stop_reason,
        stopDetails: response.stop_details ?? null,
      })
    }
    const output = response.parsed_output
    this.assertComplete(sheet, output)

    return new GameSheetTranslation(
      sheet.gameId,
      sheet.language,
      targetLanguage,
      output.description,
      output.turn_summary,
      output.end_timing,
      output.warnings,
      output.rules,
    )
  }

  /** The bulky raw output is only kept in the database. */
  private logTrace(
    sheet: GameSheet,
    targetLanguage: string,
    trace: AiTrace,
  ): void {
    const { output: _output, rawText: _rawText, ...summary } = trace
    this.logger.info({
      gameId: sheet.gameId,
      sourceLanguage: sheet.language,
      language: targetLanguage,
      ...summary,
    })
  }

  private async request(messages: Anthropic.MessageParam[]) {
    try {
      return await this.client.messages.parse({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: cachedSystemPrompt(GAME_SHEET_TRANSLATION_SYSTEM_PROMPT),
        messages,
        output_config: { effort: EFFORT, format: OUTPUT_FORMAT },
      })
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new InternalError('Anthropic API call failed', {
          code: ErrorCode.GAME_SHEET_TRANSLATION_FAILED,
          details: { status: error.status, requestId: error.requestID },
          cause: error,
        })
      }
      throw error
    }
  }

  /** Each source rule translated exactly once, and as many warnings. */
  private assertComplete(
    sheet: GameSheet,
    output: GameSheetTranslationOutput,
  ): void {
    const expected = listSourceRules(sheet).map((rule) => rule.id)
    const received = output.rules.map((rule) => rule.id)
    const receivedSet = new Set(received)
    const missing = expected.filter((id) => !receivedSet.has(id))
    const expectedSet = new Set(expected)
    const unexpected = received.filter((id) => !expectedSet.has(id))
    const duplicated = received.length !== receivedSet.size

    if (missing.length > 0 || unexpected.length > 0 || duplicated) {
      throw this.failure('Translated rules do not match the source', sheet, {
        missing,
        unexpected,
        duplicated,
      })
    }
    if (output.warnings.length !== sheet.warnings.length) {
      throw this.failure('Translated warnings do not match the source', sheet, {
        expected: sheet.warnings.length,
        received: output.warnings.length,
      })
    }
  }

  private failure(
    message: string,
    sheet: GameSheet,
    details: Record<string, unknown>,
  ): InternalError {
    return new InternalError(message, {
      code: ErrorCode.GAME_SHEET_TRANSLATION_FAILED,
      details: {
        gameId: sheet.gameId,
        sourceLanguage: sheet.language,
        ...details,
      },
    })
  }
}
