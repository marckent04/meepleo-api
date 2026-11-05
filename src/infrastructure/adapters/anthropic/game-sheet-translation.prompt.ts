import type { GameSheet } from '@/shared/types'

/** System prompt figé (aucune donnée variable) pour rester cacheable. */
export const GAME_SHEET_TRANSLATION_SYSTEM_PROMPT = `You translate board game rule sheets for Meepleo, an app that helps people play board games at the table without rereading the whole rulebook.

You receive a rule sheet as JSON, written in a source language, and a target language. Translate every text field into the target language.

Rules:
- Translate faithfully. Do not add, remove, merge, split or reorder rules, and do not fix or complete the rules from your own knowledge of the game.
- Return every rule exactly once with its id unchanged. Return title as null when the source rule has no title.
- Return the warnings in the same order and the same number as in the source.
- localized_name: the name the game is published under in the target language if you know it for certain, otherwise keep the source name.
- Short sentences in the imperative, addressed to the player (in French, use "vous"). Keep the same meaning and level of detail as the source.
- For the game's own terms (card, action and zone names), use the official terms of the target-language edition when you know them for certain; otherwise translate them consistently across the whole sheet.`

export function buildGameSheetTranslationUserPrompt(
  sheet: GameSheet,
  targetLanguage: string,
): string {
  const source = {
    game_name: sheet.game.localizedName,
    description: sheet.description,
    turn_summary: sheet.turn.summary,
    end_timing: sheet.endOfGame.timing,
    warnings: sheet.warnings,
    rules: listSourceRules(sheet).map((rule) => ({
      id: rule.id,
      section: rule.section,
      title: rule.title,
      text: rule.text,
    })),
  }
  return [
    `Source language: ${sheet.language}`,
    `Target language: ${targetLanguage}`,
    'Sheet:',
    JSON.stringify(source, null, 2),
  ].join('\n')
}

export type SourceRule = {
  id: string
  section: string
  title: string | null
  text: string
}

/** Toutes les règles d'une fiche, à plat, dans l'ordre d'affichage. */
export function listSourceRules(sheet: GameSheet): SourceRule[] {
  return [
    ...sheet.setup.map((r) => ({ ...r, section: 'setup', title: null })),
    ...sheet.turn.steps.map((r) => ({ ...r, section: 'turn' })),
    ...sheet.specialRules.map((r) => ({ ...r, section: 'special_rules' })),
    ...sheet.endOfGame.triggers.map((r) => ({
      ...r,
      section: 'end_triggers',
      title: null,
    })),
    ...sheet.endOfGame.scoring.map((r) => ({ ...r, section: 'scoring' })),
    ...sheet.endOfGame.winner.map((r) => ({
      ...r,
      section: 'winner',
      title: null,
    })),
  ].map(({ id, section, title, text }) => ({ id, section, title, text }))
}
