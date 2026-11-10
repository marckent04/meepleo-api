import { z } from 'zod'
import {
  SCORING_OUTCOMES,
  SCORING_ROW_INPUTS,
  SCORING_SIDES,
} from '@/shared/types'

/**
 * Structured output requested from the model to build a score sheet
 * template (snake_case). No nullable field: `''` and `0` mean "none".
 * Normalized into a ScoringTemplate by GameScoringTemplateGenerator.
 */
export const GameScoringOutputSchema = z.object({
  sides: z
    .enum(SCORING_SIDES)
    .describe(
      'individual: each player scores alone; teams: team mates share one score; cooperative: all the players win or lose together',
    ),
  outcome: z
    .enum(SCORING_OUTCOMES)
    .describe(
      'highest: highest total wins; lowest: lowest total wins; manual: the game has no points, the winner is whoever meets the victory condition',
    ),
  rounds: z
    .enum(['none', 'fixed', 'free'])
    .describe(
      'none: points are counted once, at the end; fixed: points are noted after each of a known number of rounds; free: rounds are noted until an end condition is met',
    ),
  round_count: z
    .number()
    .int()
    .describe('Number of rounds when rounds is "fixed", 0 otherwise'),
  target_score: z
    .number()
    .int()
    .describe(
      'Total that ends the game when a player reaches it (e.g. 66 or 100), 0 when none',
    ),
  rows: z
    .array(
      z.object({
        key: z
          .string()
          .describe('camelCase English identifier, unique (e.g. longestRoad)'),
        label: z.string().describe('Short label, in the sheet language'),
        hint: z
          .string()
          .describe(
            'Short scoring reminder, in the sheet language; empty string when the label is enough',
          ),
        input: z.enum(SCORING_ROW_INPUTS),
        points_each: z
          .number()
          .int()
          .describe(
            'Points per counted unit (count) or when checked (toggle), may be negative; 1 for points',
          ),
        exclusive: z
          .boolean()
          .describe('toggle only: a single player or team can have it'),
      }),
    )
    .describe(
      'Scoring categories added up at the end of the game; empty when a single number per player is enough',
    ),
  tie_breaker: z
    .string()
    .describe(
      'Tie-breaker rule, in the sheet language; empty string when the rules define none',
    ),
})

export type GameScoringOutput = z.infer<typeof GameScoringOutputSchema>
