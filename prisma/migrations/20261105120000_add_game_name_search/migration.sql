-- Recherche de jeux par nom (autocomplétion) : sans casse ni accents, par trigrammes.
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- unaccent() n'est que STABLE : enveloppe IMMUTABLE pour pouvoir l'indexer.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Index d'expression (non représentables dans schema.prisma).
CREATE INDEX "games_name_trgm_idx" ON "games" USING gin (f_unaccent(lower("name")) gin_trgm_ops);
CREATE INDEX "games_localized_names_fr_trgm_idx" ON "games" USING gin (f_unaccent(lower("localized_names" ->> 'fr')) gin_trgm_ops);
CREATE INDEX "games_localized_names_en_trgm_idx" ON "games" USING gin (f_unaccent(lower("localized_names" ->> 'en')) gin_trgm_ops);
