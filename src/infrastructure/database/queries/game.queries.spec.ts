import {
  escapeLike,
  lockGameSql,
  searchGamesSql,
  updateGameRuleTranslationsSql,
} from './game.queries'

const GAME_ID = '0195d1a2-0000-7000-8000-000000000001'

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('100%_\\')).toBe('100\\%\\_\\\\')
  })
})

describe('lockGameSql', () => {
  it('locks the row with the id bound as a parameter', () => {
    const query = lockGameSql(GAME_ID)
    expect(query.sql).toContain('FOR UPDATE')
    expect(query.values).toEqual([GAME_ID])
  })
})

describe('searchGamesSql', () => {
  it('binds normalized and escaped search patterns', () => {
    const query = searchGamesSql({ text: ' CAT_ ', language: 'fr', limit: 5 })

    expect(query.sql).toContain('deleted_at IS NULL')
    expect(query.sql).not.toContain('CAT')
    expect(query.values).toContain('%cat\\_%')
    expect(query.values).toContain('cat\\_%')
    expect(query.values).toContain('cat\\_')
    expect(query.values).toContain('fr')
    expect(query.values.at(-1)).toBe(5)
  })
})

describe('updateGameRuleTranslationsSql', () => {
  it('binds all rules as a single JSON parameter', () => {
    const rows = [
      { id: 'rule-1', text: { fr: 'a', en: 'b' } },
      { id: 'rule-2', text: { fr: 'c', en: 'd' }, title: { fr: 'e', en: 'f' } },
    ]
    const query = updateGameRuleTranslationsSql(rows)

    expect(query.sql).toContain('UPDATE game_rules')
    expect(query.values).toHaveLength(1)
    expect(JSON.parse(query.values[0] as string)).toEqual(rows)
  })
})
