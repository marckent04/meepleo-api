import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import {
  type PlayScore,
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
  type ScoringOutcome,
  type ScoringRow,
  type ScoringRowInput as ScoringRowInputType,
  type ScoringSides,
  type ScoringTemplate,
} from '@/shared/types'

export const PLAY_MAX_PLAYERS = 20
export const PLAY_PLAYER_NAME_MAX_LENGTH = 40
export const PLAY_NOTE_MAX_LENGTH = 1000
/** Cells of a full sheet: players × (rounds + rows), with some margin. */
export const PLAY_MAX_SCORES = 5000
export const LIST_PLAYS_MAX_LIMIT = 100

/** Player of a play to create, in display order. */
export class PlayerInput {
  @IsString()
  @Length(1, PLAY_PLAYER_NAME_MAX_LENGTH)
  readonly name: string

  /** Column of the score sheet (0-based); team mates share it. */
  @IsInt()
  @Min(0)
  @Max(PLAY_MAX_PLAYERS - 1)
  readonly side: number

  /** The player is the user recording the play. */
  @IsBoolean()
  readonly isCurrentUser: boolean

  constructor({
    name,
    side,
    isCurrentUser,
  }: {
    name: string
    side: number
    isCurrentUser: boolean
  }) {
    this.name = name
    this.side = side
    this.isCurrentUser = isCurrentUser
  }
}

export class ScoringRowInput {
  @Matches(SCORING_ROW_KEY_PATTERN)
  readonly key: string

  @IsString()
  @Length(1, SCORING_LABEL_MAX_LENGTH)
  readonly label: string

  @ValidateIf((row: ScoringRowInput) => row.hint !== null)
  @IsString()
  @Length(1, SCORING_HINT_MAX_LENGTH)
  readonly hint: string | null

  @IsIn(SCORING_ROW_INPUTS)
  readonly input: ScoringRowInputType

  @IsInt()
  @Min(-SCORING_MAX_ABS_VALUE)
  @Max(SCORING_MAX_ABS_VALUE)
  readonly pointsEach: number

  @IsBoolean()
  readonly exclusive: boolean

  constructor(row: ScoringRow) {
    this.key = row.key
    this.label = row.label
    this.hint = row.hint
    this.input = row.input
    this.pointsEach = row.pointsEach
    this.exclusive = row.exclusive
  }
}

export class ScoringRoundsInput {
  @ValidateIf((rounds: ScoringRoundsInput) => rounds.count !== null)
  @IsInt()
  @Min(1)
  @Max(SCORING_MAX_ROUNDS)
  readonly count: number | null

  constructor({ count }: { count: number | null }) {
    this.count = count
  }
}

/** Score sheet template sent by the user (adapted for a play). */
export class ScoringTemplateInput {
  @IsIn(SCORING_SIDES)
  readonly sides: ScoringSides

  @IsIn(SCORING_OUTCOMES)
  readonly outcome: ScoringOutcome

  @ValidateIf((template: ScoringTemplateInput) => template.rounds !== null)
  @ValidateNested()
  readonly rounds: ScoringRoundsInput | null

  @ValidateIf((template: ScoringTemplateInput) => template.targetScore !== null)
  @IsInt()
  @Min(-SCORING_MAX_ABS_VALUE)
  @Max(SCORING_MAX_ABS_VALUE)
  readonly targetScore: number | null

  @ArrayMaxSize(SCORING_MAX_ROWS)
  @ValidateNested({ each: true })
  readonly rows: ScoringRowInput[]

  @ValidateIf((template: ScoringTemplateInput) => template.tieBreaker !== null)
  @IsString()
  @Length(1, SCORING_TIE_BREAKER_MAX_LENGTH)
  readonly tieBreaker: string | null

  constructor(template: ScoringTemplate) {
    this.sides = template.sides
    this.outcome = template.outcome
    this.rounds = template.rounds && new ScoringRoundsInput(template.rounds)
    this.targetScore = template.targetScore
    this.rows = template.rows.map((row) => new ScoringRowInput(row))
    this.tieBreaker = template.tieBreaker
  }

  /** Plain copy, to store. */
  toTemplate(): ScoringTemplate {
    return {
      sides: this.sides,
      outcome: this.outcome,
      rounds: this.rounds && { count: this.rounds.count },
      targetScore: this.targetScore,
      rows: this.rows.map((row) => ({
        key: row.key,
        label: row.label,
        hint: row.hint,
        input: row.input,
        pointsEach: row.pointsEach,
        exclusive: row.exclusive,
      })),
      tieBreaker: this.tieBreaker,
    }
  }
}

/** Score cell; its consistency with the template is checked by the handler. */
export class PlayScoreInput {
  @IsInt()
  @Min(0)
  @Max(PLAY_MAX_PLAYERS - 1)
  readonly side: number

  @IsString()
  @Length(1, 40)
  readonly rowKey: string

  @IsInt()
  @Min(0)
  @Max(SCORING_MAX_ROUNDS)
  readonly round: number

  @IsInt()
  @Min(-SCORING_MAX_ABS_VALUE)
  @Max(SCORING_MAX_ABS_VALUE)
  readonly value: number

  constructor({ side, rowKey, round, value }: PlayScore) {
    this.side = side
    this.rowKey = rowKey
    this.round = round
    this.value = value
  }
}
