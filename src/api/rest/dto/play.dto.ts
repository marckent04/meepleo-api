import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  LIST_PLAYS_MAX_LIMIT,
  PLAY_MAX_PLAYERS,
  PLAY_MAX_SCORES,
  PLAY_NOTE_MAX_LENGTH,
  PLAY_PLAYER_NAME_MAX_LENGTH,
} from '@/domain/play/commands/play-inputs'
import {
  PLAY_STATUSES,
  type Play,
  type PlaySummary,
  ROUND_SCORE_KEY,
  SCORING_HINT_MAX_LENGTH,
  SCORING_LABEL_MAX_LENGTH,
  SCORING_MAX_ABS_VALUE,
  SCORING_MAX_ROUNDS,
  SCORING_MAX_ROWS,
  SCORING_OUTCOMES,
  SCORING_ROW_INPUTS,
  SCORING_ROW_KEY_PATTERN,
  SCORING_SIDES,
  SCORING_TIE_BREAKER_MAX_LENGTH,
  type ScoringTemplate,
  TOTAL_SCORE_KEY,
} from '@/shared/types'

// ---------------------------------------------------------------------------
// Score sheet template
// ---------------------------------------------------------------------------

const ScoreValueSchema = z
  .number()
  .int()
  .min(-SCORING_MAX_ABS_VALUE)
  .max(SCORING_MAX_ABS_VALUE)

const SidesSchema = z
  .enum(SCORING_SIDES)
  .describe(
    'Who occupies a column: one player (individual), team mates (teams), or all the players together (cooperative)',
  )

export const ScoringRowSchema = z.object({
  key: z
    .string()
    .regex(SCORING_ROW_KEY_PATTERN)
    .describe('Stable camelCase identifier, unique in the template')
    .meta({ example: 'longestRoad' }),
  label: z
    .string()
    .trim()
    .min(1)
    .max(SCORING_LABEL_MAX_LENGTH)
    .describe('Row label')
    .meta({ example: 'Longest road' }),
  hint: z
    .string()
    .trim()
    .min(1)
    .max(SCORING_HINT_MAX_LENGTH)
    .nullable()
    .describe('Scoring reminder shown under the label')
    .meta({ example: 'At least 5 road segments' }),
  input: z
    .enum(SCORING_ROW_INPUTS)
    .describe(
      'Input widget: `points` (numeric keypad, negatives allowed), `count` (- / + counter), `toggle` (checkbox)',
    ),
  pointsEach: ScoreValueSchema.describe(
    'Points per counted unit (`count`) or when checked (`toggle`); always 1 for `points`. May be negative',
  ).meta({ example: 2 }),
  exclusive: z
    .boolean()
    .describe(
      '`toggle` only: a single side can have it checked (e.g. longest road)',
    ),
})

export const ScoringTemplateSchema = z.object({
  sides: SidesSchema,
  outcome: z
    .enum(SCORING_OUTCOMES)
    .describe(
      'Winner: highest total, lowest total, or chosen by the players (`manual`: no score sheet)',
    ),
  rounds: z
    .object({
      count: z
        .number()
        .int()
        .min(1)
        .max(SCORING_MAX_ROUNDS)
        .nullable()
        .describe(
          'Number of rounds; null when the players add as many as they want',
        ),
    })
    .nullable()
    .describe(
      `One line per round (cells \`${ROUND_SCORE_KEY}\`, rounds from 1); null without rounds`,
    ),
  targetScore: ScoreValueSchema.nullable()
    .describe(
      'Informative end score (e.g. 66): the app can announce it, it never blocks anything',
    )
    .meta({ example: 66 }),
  rows: z
    .array(ScoringRowSchema)
    .max(SCORING_MAX_ROWS)
    .describe(
      `Fixed scoring categories, in display order (cells in round 0). Without rows nor rounds, each side has a single score (cell \`${TOTAL_SCORE_KEY}\`)`,
    ),
  tieBreaker: z
    .string()
    .trim()
    .min(1)
    .max(SCORING_TIE_BREAKER_MAX_LENGTH)
    .nullable()
    .describe('Tie-breaker rule to display on a tie, null when none'),
})

export class ScoringTemplateResponseDto extends createZodDto(
  ScoringTemplateSchema.describe(
    'Score sheet template of the game, texts in the Accept-Language language',
  ),
  { codec: true },
) {
  static fromDomain(template: ScoringTemplate): ScoringTemplateResponseDto {
    return {
      ...template,
      rounds: template.rounds && { ...template.rounds },
      rows: template.rows.map((row) => ({ ...row })),
    }
  }
}

// ---------------------------------------------------------------------------
// Plays: requests
// ---------------------------------------------------------------------------

const DateTimeSchema = z.iso.datetime({ offset: true })

const ScoreSchema = z.object({
  side: z
    .number()
    .int()
    .min(0)
    .max(PLAY_MAX_PLAYERS - 1)
    .describe('Column of the score sheet (0-based)'),
  rowKey: z
    .string()
    .min(1)
    .max(40)
    .describe(
      `Row key of the template, \`${ROUND_SCORE_KEY}\` for a round, or \`${TOTAL_SCORE_KEY}\` for the single score`,
    )
    .meta({ example: ROUND_SCORE_KEY }),
  round: z
    .number()
    .int()
    .min(0)
    .max(SCORING_MAX_ROUNDS)
    .describe('Round number (from 1) of a round cell, 0 otherwise'),
  value: ScoreValueSchema.describe(
    'Entered value: points, counted units, or 0 / 1 for a toggle',
  ),
})

export const PlayIdParamSchema = z.object({
  id: z
    .uuid()
    .describe('Play identifier')
    .meta({ example: '0195d1a2-0000-7000-8000-000000000001' }),
})

export class PlayIdParamDto extends createZodDto(PlayIdParamSchema) {}

export const CreatePlayBodySchema = z.object({
  gameId: z.uuid().describe('Game played'),
  playedAt: DateTimeSchema.optional().describe(
    'Date of the play (ISO 8601); defaults to now',
  ),
  note: z
    .string()
    .trim()
    .max(PLAY_NOTE_MAX_LENGTH)
    .nullable()
    .optional()
    .describe('Free note'),
  players: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(PLAY_PLAYER_NAME_MAX_LENGTH)
          .describe('Player name')
          .meta({ example: 'Léa' }),
        side: z
          .number()
          .int()
          .min(0)
          .max(PLAY_MAX_PLAYERS - 1)
          .describe(
            'Column of the score sheet: 0 to n-1, one per player (individual), shared by team mates (teams), 0 for everyone (cooperative)',
          ),
        isCurrentUser: z
          .boolean()
          .default(false)
          .describe('The player is the authenticated user (at most one)'),
      }),
    )
    .min(1)
    .max(PLAY_MAX_PLAYERS)
    .describe('Players, in display order'),
  scoring: ScoringTemplateSchema.optional().describe(
    'Score sheet adapted for this play (e.g. a row added for an expansion); defaults to the game template (GET /games/:id/scoring)',
  ),
  sides: SidesSchema.optional().describe(
    "Overrides the template's sides, e.g. a game usually played alone played in teams",
  ),
})

export class CreatePlayBodyDto extends createZodDto(CreatePlayBodySchema) {}

export const SavePlayScoresBodySchema = z.object({
  scores: z
    .array(ScoreSchema)
    .max(PLAY_MAX_SCORES)
    .describe(
      'Whole score sheet: replaces the saved cells; a cell left out is empty (0)',
    ),
})

export class SavePlayScoresBodyDto extends createZodDto(
  SavePlayScoresBodySchema,
) {}

export const UpdatePlayBodySchema = z.object({
  playedAt: DateTimeSchema.optional().describe('Date of the play (ISO 8601)'),
  note: z
    .string()
    .trim()
    .max(PLAY_NOTE_MAX_LENGTH)
    .nullable()
    .optional()
    .describe('Free note; null clears it'),
})

export class UpdatePlayBodyDto extends createZodDto(UpdatePlayBodySchema) {}

export const CompletePlayBodySchema = z
  .object({
    winnerSides: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(PLAY_MAX_PLAYERS - 1),
      )
      .max(PLAY_MAX_PLAYERS)
      .optional()
      .describe(
        'Winning sides, overriding the computed ones (sides ranked first). Required for a `manual` outcome; empty when nobody won (lost cooperative game)',
      )
      .meta({ example: [0] }),
  })
  // The body is optional: no body = the computed winners.
  .default({})

export class CompletePlayBodyDto extends createZodDto(CompletePlayBodySchema) {}

export const ListPlaysQuerySchema = z.object({
  gameId: z.uuid().optional().describe('Only the plays of this game'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIST_PLAYS_MAX_LIMIT)
    .default(20)
    .describe('Maximum number of plays'),
})

export class ListPlaysQueryDto extends createZodDto(ListPlaysQuerySchema) {}

// ---------------------------------------------------------------------------
// Plays: responses
// ---------------------------------------------------------------------------

const PlaySummaryShape = {
  id: z.uuid().describe('Play identifier'),
  game: z
    .object({
      id: z.uuid().describe('Game identifier'),
      name: z
        .string()
        .describe(
          'Name in the Accept-Language language when known, otherwise the canonical name',
        )
        .meta({ example: 'Catan' }),
      imageUrl: z.string().nullable().describe('URL of the box cover image'),
    })
    .describe('Game played'),
  status: z.enum(PLAY_STATUSES).describe('Play in progress or completed'),
  playedAt: z.iso
    .datetime()
    .describe('Date of the play (ISO 8601, UTC)')
    .meta({ example: '2026-01-01T20:00:00.000Z' }),
  completedAt: z.iso
    .datetime()
    .nullable()
    .describe('Completion date (ISO 8601, UTC)'),
  note: z.string().nullable().describe('Free note'),
  players: z
    .array(
      z.object({
        id: z.uuid().describe('Player identifier'),
        userId: z
          .uuid()
          .nullable()
          .describe('Account of the player, null for a guest'),
        name: z.string().describe('Player name'),
        side: z.number().int().describe('Column of the score sheet'),
        total: z
          .number()
          .int()
          .nullable()
          .describe('Total of the side, null for a manual outcome'),
        rank: z
          .number()
          .int()
          .nullable()
          .describe(
            'Rank of the side (1 = first, ties share a rank), null for a manual outcome',
          ),
        isWinner: z
          .boolean()
          .describe('Winner, designated when the play is completed'),
      }),
    )
    .describe('Players, in display order'),
}

function toPlaySummaryResponse(play: PlaySummary) {
  return {
    id: play.id,
    game: { ...play.game },
    status: play.status,
    playedAt: play.playedAt.toISOString(),
    completedAt: play.completedAt?.toISOString() ?? null,
    note: play.note,
    players: play.players.map((player) => ({ ...player })),
  }
}

export const PlayResponseSchema = z
  .object({
    ...PlaySummaryShape,
    scoring: ScoringTemplateSchema.describe(
      'Score sheet of the play, copied from the game template at creation',
    ),
    scores: z.array(ScoreSchema).describe('Entered cells'),
  })
  .describe('Play and its score sheet')

export class PlayResponseDto extends createZodDto(PlayResponseSchema, {
  codec: true,
}) {
  static fromDomain(play: Play): PlayResponseDto {
    return {
      ...toPlaySummaryResponse(play),
      scoring: ScoringTemplateResponseDto.fromDomain(play.scoring),
      scores: play.scores.map((score) => ({ ...score })),
    }
  }
}

export const PlaysResponseSchema = z
  .array(z.object(PlaySummaryShape))
  .describe("User's plays, most recently played first")

export class PlaysResponseDto extends createZodDto(PlaysResponseSchema, {
  codec: true,
}) {
  static fromDomain(plays: PlaySummary[]): PlaysResponseDto {
    return plays.map(toPlaySummaryResponse)
  }
}
