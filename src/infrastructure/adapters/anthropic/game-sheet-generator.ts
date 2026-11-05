import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { Inject, Injectable } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ANTHROPIC_CONFIG } from '@/shared/config'
import { ErrorCode, InternalError } from '@/shared/errors'
import { type Game, GameSheet } from '@/shared/types'
import { ANTHROPIC_CLIENT } from './anthropic.client'
import {
  buildGameSheetUserPrompt,
  GAME_SHEET_SYSTEM_PROMPT,
} from './game-sheet.prompt'
import {
  type GameSheetOutput,
  GameSheetOutputSchema,
} from './game-sheet.schema'

/** Relances maximales quand la boucle d'outils serveur s'interrompt (`pause_turn`). */
const MAX_CONTINUATIONS = 5

/**
 * Variantes de base : les variantes `_20260209` (filtrage dynamique) ne
 * prennent pas en charge Claude Haiku 5.5. Pas de `citations` : incompatibles
 * avec les sorties structurées.
 */
const WEB_TOOLS: Anthropic.ToolUnion[] = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
  {
    type: 'web_fetch_20250910',
    name: 'web_fetch',
    max_uses: 3,
    max_content_tokens: 60_000,
  },
]

/** Génère une fiche de règles : recherche d'une règle sur le web, puis extraction typée. */
@Injectable()
export class GameSheetGenerator {
  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic,
    @Inject(ANTHROPIC_CONFIG.KEY)
    private readonly config: ConfigType<typeof ANTHROPIC_CONFIG>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(GameSheetGenerator.name)
  }

  async generate(game: Game, language: string): Promise<GameSheet> {
    const model = this.config.sheetModel
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: buildGameSheetUserPrompt(game, language) },
    ]

    let response = await this.request(model, messages)
    for (let i = 0; response.stop_reason === 'pause_turn'; i++) {
      if (i >= MAX_CONTINUATIONS) {
        throw this.failure('Too many pause_turn continuations', game, response)
      }
      // La reprise se fait sur le bloc server_tool_use final, sans nouveau message utilisateur.
      messages.push({ role: 'assistant', content: response.content })
      response = await this.request(model, messages)
    }

    this.logger.info({
      gameId: game.id,
      language,
      model: response.model,
      stopReason: response.stop_reason,
      usage: response.usage,
    })

    if (response.stop_reason !== 'end_turn') {
      throw this.failure(`Unexpected stop reason`, game, response)
    }
    if (!response.parsed_output) {
      throw this.failure(
        'Structured output could not be parsed',
        game,
        response,
      )
    }
    return toGameSheet(
      game.id,
      language,
      response.model,
      response.parsed_output,
    )
  }

  private async request(model: string, messages: Anthropic.MessageParam[]) {
    try {
      return await this.client.messages.parse({
        model,
        max_tokens: 16_000,
        system: GAME_SHEET_SYSTEM_PROMPT,
        messages,
        tools: WEB_TOOLS,
        output_config: {
          effort: 'medium',
          format: zodOutputFormat(GameSheetOutputSchema),
        },
      })
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new InternalError('Anthropic API call failed', {
          code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
          details: { status: error.status, requestId: error.requestID },
          cause: error,
        })
      }
      throw error
    }
  }

  private failure(
    message: string,
    game: Game,
    response: { stop_reason: string | null; stop_details?: unknown },
  ): InternalError {
    return new InternalError(message, {
      code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
      details: {
        gameId: game.id,
        stopReason: response.stop_reason,
        stopDetails: response.stop_details ?? null,
      },
    })
  }
}

export function toGameSheet(
  gameId: string,
  language: string,
  model: string,
  output: GameSheetOutput,
): GameSheet {
  const entry = (e: {
    id: string
    player_counts: number[] | null
    text: string
  }) => ({
    id: e.id,
    playerCounts: e.player_counts,
    text: e.text,
  })
  return new GameSheet(
    gameId,
    language,
    {
      localizedName: output.game.localized_name,
      edition: output.game.edition,
      publisher: output.game.publisher,
      ruleBookUrl: output.game.rule_book_url,
    },
    output.players,
    output.min_age,
    output.duration_minutes,
    output.description,
    output.setup.map((s) => ({ ...entry(s), order: s.order })),
    {
      summary: output.turn.summary,
      steps: output.turn.steps.map((s) => ({
        ...entry(s),
        order: s.order,
        optional: s.optional,
        title: s.title,
      })),
    },
    output.special_rules.map((r) => ({ ...entry(r), title: r.title })),
    {
      triggers: output.end_of_game.triggers.map(entry),
      timing: output.end_of_game.timing,
      scoring: output.end_of_game.scoring.map((s) => ({
        ...entry(s),
        order: s.order,
        title: s.title,
      })),
      winner: output.end_of_game.winner.map(entry),
    },
    output.confidence,
    output.sources,
    output.warnings,
    model,
    new Date(),
  )
}
