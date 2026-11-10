-- Alternative names are not used anymore: the game search relies on the
-- canonical and localized names only.
DROP INDEX IF EXISTS "games_alternative_names_trgm_idx";

DROP FUNCTION IF EXISTS f_search_names(text[]);

-- AlterTable
ALTER TABLE "games" DROP COLUMN "alternative_names";
