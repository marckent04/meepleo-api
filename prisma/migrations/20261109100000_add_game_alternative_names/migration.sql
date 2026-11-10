-- AlterTable
ALTER TABLE "games" ADD COLUMN     "alternative_names" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Game search by alternative name: case and accents ignored, by trigrams.

-- array_to_string() is only STABLE: IMMUTABLE wrapper so it can be indexed.
-- Names are joined with a line feed, which a search term never contains, so a
-- LIKE '%term%' on the result only matches inside a single name.
CREATE OR REPLACE FUNCTION f_search_names(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.f_unaccent(lower(array_to_string($1, E'\n'))) $$;

-- Expression index (cannot be represented in schema.prisma).
CREATE INDEX "games_alternative_names_trgm_idx" ON "games" USING gin (f_search_names("alternative_names") gin_trgm_ops);

-- Recommended player counts are not used anymore.
ALTER TABLE "games" DROP COLUMN "recommended_players";
