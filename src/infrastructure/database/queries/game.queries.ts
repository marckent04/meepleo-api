import { Prisma } from '../generated/prisma/client'

/**
 * Raw SQL queries on `games`, out of the Prisma client's reach.
 * `Prisma.sql` binds each `${…}` as a parameter: no text interpolation.
 * Parameters arrive untyped (`unknown`): we cast them explicitly,
 * otherwise `jsonb ->> $1` is ambiguous (text key or integer index).
 */

/** Escapes LIKE wildcards (`\\`, `%`, `_`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, String.raw`\$&`)
}

/** Locks the row of a non-deleted game (`SELECT … FOR UPDATE`). */
export function lockGameSql(id: string): Prisma.Sql {
  return Prisma.sql`
    SELECT id FROM games WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`
}

export type SearchGamesSqlParams = {
  text: string
  language: string
  limit: number
}

/**
 * Non-deleted games whose canonical name or name in `language`
 * contains `text` (case and accents ignored). Order: names starting with
 * `text`, then trigram similarity, then alphabetical order.
 * Relies on `f_unaccent` and the trigram indexes of the migration
 * `add_game_name_search`. Rows: `GameSearchRow`.
 */
export function searchGamesSql({
  text,
  language,
  limit,
}: SearchGamesSqlParams): Prisma.Sql {
  const term = escapeLike(text.trim().toLowerCase())
  const contains = `%${term}%`
  const startsWith = `${term}%`
  return Prisma.sql`
    SELECT id,
           name,
           localized_names ->> ${language}::text AS localized_name,
           year,
           categories::text[] AS categories
    FROM games
    WHERE deleted_at IS NULL
      AND (f_unaccent(lower(name)) LIKE f_unaccent(${contains}::text)
           OR f_unaccent(lower(localized_names ->> ${language}::text)) LIKE f_unaccent(${contains}::text))
    ORDER BY
      f_unaccent(lower(coalesce(localized_names ->> ${language}::text, name))) LIKE f_unaccent(${startsWith}::text) DESC,
      similarity(f_unaccent(lower(coalesce(localized_names ->> ${language}::text, name))), f_unaccent(${term}::text)) DESC,
      name ASC
    LIMIT ${limit}::int`
}
