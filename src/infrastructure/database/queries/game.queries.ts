import { Prisma } from '../generated/prisma/client'

/**
 * Requêtes SQL brutes sur `games`, hors de portée du client Prisma.
 * `Prisma.sql` lie chaque `${…}` en paramètre : aucune interpolation de texte.
 * Les paramètres arrivent sans type (`unknown`) : on les caste explicitement,
 * sinon `jsonb ->> $1` est ambigu (clé texte ou index entier).
 */

/** Échappe les jokers de LIKE (`\\`, `%`, `_`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, String.raw`\$&`)
}

/** Verrouille la ligne d'un jeu non supprimé (`SELECT … FOR UPDATE`). */
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
 * Jeux non supprimés dont le nom canonique ou le nom dans `language`
 * contient `text` (casse et accents ignorés). Tri : noms commençant par
 * `text`, puis similarité trigramme, puis ordre alphabétique.
 * S'appuie sur `f_unaccent` et les index trigrammes de la migration
 * `add_game_name_search`. Lignes : `GameSearchRow`.
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
