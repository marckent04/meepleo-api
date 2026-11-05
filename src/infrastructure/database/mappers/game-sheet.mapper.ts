import {
  GameSheet,
  type GameSheetEntry,
  type GameSheetSource,
  type GameSheetStatus,
  type GameSheetTranslation,
  type SheetConfidence,
} from '@/shared/types'
import type {
  Game as GameRecord,
  GameRule as GameRuleRecord,
  Prisma,
} from '../generated/prisma/client'
import {
  RuleType,
  SheetConfidence as SheetConfidenceRecord,
} from '../generated/prisma/client'

export type GameWithRulesRecord = GameRecord & { rules: GameRuleRecord[] }

/** `{ "fr": "...", "en": "..." }` */
type LocalizedText = Record<string, string>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toLocalizedText(value: Prisma.JsonValue | null): LocalizedText {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function localized(
  value: Prisma.JsonValue | null,
  language: string,
): string | null {
  return toLocalizedText(value)[language] ?? null
}

function withLanguage(
  value: Prisma.JsonValue | null,
  language: string,
  text: string,
): LocalizedText {
  return { ...toLocalizedText(value), [language]: text }
}

function toArray(value: Prisma.JsonValue | null): Prisma.JsonValue[] {
  return Array.isArray(value) ? value : []
}

function toSources(value: Prisma.JsonValue | null): GameSheetSource[] {
  return toArray(value).flatMap((source) =>
    isRecord(source) &&
    typeof source.title === 'string' &&
    typeof source.url === 'string'
      ? [{ title: source.title, url: source.url }]
      : [],
  )
}

const CONFIDENCE_TO_RECORD: Record<SheetConfidence, SheetConfidenceRecord> = {
  low: SheetConfidenceRecord.LOW,
  medium: SheetConfidenceRecord.MEDIUM,
  high: SheetConfidenceRecord.HIGH,
}

const CONFIDENCE_FROM_RECORD: Record<SheetConfidenceRecord, SheetConfidence> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
}

/** Ordre d'affichage : `position` (rang produit par l'IA), puis id. */
function compareRules(a: GameRuleRecord, b: GameRuleRecord): number {
  return a.position - b.position || a.id.localeCompare(b.id)
}

export function toGameSheetStatus(
  record: Pick<
    GameRecord,
    'sheetGeneratedAt' | 'sheetGeneratedBy' | 'supportedLanguages'
  >,
): GameSheetStatus {
  return {
    generated:
      record.sheetGeneratedAt !== null && record.sheetGeneratedBy !== null,
    supportedLanguages: record.supportedLanguages,
  }
}

/** La fiche est agrégée dans `language` : générée, et disponible dans cette langue. */
export function isGameSheetAggregated(
  record: Pick<
    GameRecord,
    'sheetGeneratedAt' | 'sheetGeneratedBy' | 'supportedLanguages'
  >,
  language: string,
): boolean {
  const status = toGameSheetStatus(record)
  return status.generated && status.supportedLanguages.includes(language)
}

/** Fiche stockée, dans `language`. Les ids des entrées sont ceux des `GameRule`. */
export function toStoredGameSheet(
  record: GameWithRulesRecord,
  language: string,
): GameSheet {
  if (!record.sheetGeneratedAt || !record.sheetGeneratedBy) {
    throw new Error(`Game ${record.id} has no generated sheet`)
  }
  const rulesOf = (type: RuleType) =>
    record.rules.filter((rule) => rule.type === type).sort(compareRules)
  const entry = (rule: GameRuleRecord): GameSheetEntry => ({
    id: rule.id,
    playerCounts: rule.playerCounts.length > 0 ? rule.playerCounts : null,
    text: localized(rule.text, language) ?? '',
  })
  const title = (rule: GameRuleRecord) => localized(rule.title, language) ?? ''

  return new GameSheet(
    record.id,
    language,
    {
      localizedName: localized(record.localizedNames, language) ?? record.name,
      edition: record.edition,
      publisher: record.publisher,
      ruleBookUrl: record.ruleBookUrl,
    },
    {
      min: record.minPlayers,
      max: record.maxPlayers,
      recommended: record.recommendedPlayers,
    },
    record.minAge,
    { min: record.minDuration, max: record.maxDuration },
    localized(record.description, language) ?? '',
    rulesOf(RuleType.SETUP).map((r) => ({ ...entry(r), order: r.order })),
    {
      summary: localized(record.turnSummary, language) ?? '',
      steps: rulesOf(RuleType.TURN).map((r) => ({
        ...entry(r),
        order: r.order,
        optional: r.optional,
        title: title(r),
      })),
    },
    rulesOf(RuleType.SPECIAL).map((r) => ({ ...entry(r), title: title(r) })),
    {
      triggers: rulesOf(RuleType.END_TRIGGER).map(entry),
      timing: localized(record.endTiming, language) ?? '',
      scoring: rulesOf(RuleType.SCORING).map((r) => ({
        ...entry(r),
        order: r.order,
        title: title(r),
      })),
      winner: rulesOf(RuleType.WINNER).map(entry),
    },
    record.sheetConfidence
      ? CONFIDENCE_FROM_RECORD[record.sheetConfidence]
      : 'low',
    toSources(record.sheetSources),
    toArray(record.sheetWarnings).flatMap((warning) => {
      const text = localized(warning, language)
      return text === null ? [] : [text]
    }),
    record.sheetGeneratedBy,
    record.sheetGeneratedAt,
  )
}

export type GeneratedGameSheetData = {
  game: Prisma.GameUpdateInput
  rules: Prisma.GameRuleCreateManyInput[]
}

/**
 * Données d'écriture d'une fiche générée. Les colonnes non traduites
 * (éditeur, joueurs, âge, durée…) ne sont remplies que si elles sont vides :
 * les données BGG restent la référence.
 */
export function toGeneratedGameSheetData(
  sheet: GameSheet,
  current: GameRecord,
): GeneratedGameSheetData {
  const language = sheet.language
  const rule = (
    type: RuleType,
    order: number,
    position: number,
    entry: GameSheetEntry,
    extra: { title?: string; optional?: boolean } = {},
  ): Prisma.GameRuleCreateManyInput => ({
    gameId: sheet.gameId,
    type,
    order,
    position,
    playerCounts: entry.playerCounts ?? [],
    optional: extra.optional ?? false,
    title: extra.title === undefined ? undefined : { [language]: extra.title },
    text: { [language]: entry.text },
  })

  return {
    game: {
      localizedNames: withLanguage(
        current.localizedNames,
        language,
        sheet.game.localizedName,
      ),
      description: withLanguage(
        current.description,
        language,
        sheet.description,
      ),
      edition: current.edition ?? sheet.game.edition,
      publisher: current.publisher ?? sheet.game.publisher,
      ruleBookUrl: current.ruleBookUrl ?? sheet.game.ruleBookUrl,
      minPlayers: current.minPlayers ?? sheet.players.min,
      maxPlayers: current.maxPlayers ?? sheet.players.max,
      recommendedPlayers:
        current.recommendedPlayers.length > 0
          ? current.recommendedPlayers
          : sheet.players.recommended,
      minAge: current.minAge ?? sheet.minAge,
      minDuration: current.minDuration ?? sheet.durationMinutes.min,
      maxDuration: current.maxDuration ?? sheet.durationMinutes.max,
      supportedLanguages: [language],
      turnSummary: withLanguage(
        current.turnSummary,
        language,
        sheet.turn.summary,
      ),
      endTiming: withLanguage(
        current.endTiming,
        language,
        sheet.endOfGame.timing,
      ),
      sheetConfidence: CONFIDENCE_TO_RECORD[sheet.confidence],
      sheetSources: sheet.sources,
      sheetWarnings: sheet.warnings.map((warning) => ({ [language]: warning })),
      sheetGeneratedAt: sheet.generatedAt,
      sheetGeneratedBy: sheet.generatedBy,
    },
    rules: [
      ...sheet.setup.map((e, i) => rule(RuleType.SETUP, e.order, i, e)),
      ...sheet.turn.steps.map((e, i) =>
        rule(RuleType.TURN, e.order, i, e, {
          title: e.title,
          optional: e.optional,
        }),
      ),
      ...sheet.specialRules.map((e, i) =>
        rule(RuleType.SPECIAL, i + 1, i, e, { title: e.title }),
      ),
      ...sheet.endOfGame.triggers.map((e, i) =>
        rule(RuleType.END_TRIGGER, i + 1, i, e),
      ),
      ...sheet.endOfGame.scoring.map((e, i) =>
        rule(RuleType.SCORING, e.order, i, e, { title: e.title }),
      ),
      ...sheet.endOfGame.winner.map((e, i) =>
        rule(RuleType.WINNER, i + 1, i, e),
      ),
    ],
  }
}

export type GameSheetTranslationData = {
  game: Prisma.GameUpdateInput
  rules: { id: string; data: Prisma.GameRuleUpdateInput }[]
}

/**
 * Données d'écriture d'une traduction : la langue est ajoutée aux textes
 * existants, sans créer ni supprimer de règle.
 */
export function toGameSheetTranslationData(
  translation: GameSheetTranslation,
  current: GameWithRulesRecord,
): GameSheetTranslationData {
  const language = translation.language
  const currentRules = new Map(current.rules.map((rule) => [rule.id, rule]))
  const warnings = toArray(current.sheetWarnings)

  return {
    game: {
      localizedNames: withLanguage(
        current.localizedNames,
        language,
        translation.localizedName,
      ),
      description: withLanguage(
        current.description,
        language,
        translation.description,
      ),
      turnSummary: withLanguage(
        current.turnSummary,
        language,
        translation.turnSummary,
      ),
      endTiming: withLanguage(
        current.endTiming,
        language,
        translation.endTiming,
      ),
      sheetWarnings: warnings.map((warning, i) =>
        translation.warnings[i] === undefined
          ? toLocalizedText(warning)
          : withLanguage(warning, language, translation.warnings[i]),
      ),
      supportedLanguages: [
        ...new Set([...current.supportedLanguages, language]),
      ],
    },
    rules: translation.rules.map((translated) => {
      const rule = currentRules.get(translated.id)
      if (!rule) {
        throw new Error(
          `Rule ${translated.id} does not belong to game ${current.id}`,
        )
      }
      return {
        id: rule.id,
        data: {
          text: withLanguage(rule.text, language, translated.text),
          ...(rule.title !== null && translated.title !== null
            ? { title: withLanguage(rule.title, language, translated.title) }
            : {}),
        },
      }
    }),
  }
}
