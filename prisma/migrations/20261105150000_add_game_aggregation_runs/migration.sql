-- Remplace game_aggregation_errors par game_aggregation_runs : chaque tentative
-- d'agrégation (succès ou échec) y est tracée, et la dernière génération réussie
-- remplace games.sheet_generated_at / sheet_generated_by.

-- CreateEnum
CREATE TYPE "game_aggregation_status" AS ENUM ('SUCCESS', 'FAILURE');

-- Rename table (les erreurs existantes deviennent des runs FAILURE)
ALTER TABLE "game_aggregation_errors" RENAME TO "game_aggregation_runs";
ALTER TABLE "game_aggregation_runs" RENAME CONSTRAINT "game_aggregation_errors_pkey" TO "game_aggregation_runs_pkey";
ALTER TABLE "game_aggregation_runs" RENAME CONSTRAINT "game_aggregation_errors_game_id_fkey" TO "game_aggregation_runs_game_id_fkey";
ALTER INDEX "game_aggregation_errors_game_id_created_at_idx" RENAME TO "game_aggregation_runs_game_id_created_at_idx";

ALTER TABLE "game_aggregation_runs" RENAME COLUMN "code" TO "error_code";
ALTER TABLE "game_aggregation_runs" RENAME COLUMN "message" TO "error_message";
ALTER TABLE "game_aggregation_runs" RENAME COLUMN "details" TO "error_details";
ALTER TABLE "game_aggregation_runs" ALTER COLUMN "error_code" DROP NOT NULL;
ALTER TABLE "game_aggregation_runs" ALTER COLUMN "error_message" DROP NOT NULL;

ALTER TABLE "game_aggregation_runs"
    ADD COLUMN "status" "game_aggregation_status" NOT NULL DEFAULT 'FAILURE',
    ADD COLUMN "duration_ms" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "ai_duration_ms" INTEGER,
    ADD COLUMN "request_count" INTEGER,
    ADD COLUMN "input_tokens" INTEGER,
    ADD COLUMN "output_tokens" INTEGER,
    ADD COLUMN "cache_creation_input_tokens" INTEGER,
    ADD COLUMN "cache_read_input_tokens" INTEGER,
    ADD COLUMN "web_search_requests" INTEGER,
    ADD COLUMN "web_fetch_requests" INTEGER,
    ADD COLUMN "stop_reason" TEXT,
    ADD COLUMN "prompt_version" TEXT,
    ADD COLUMN "settings" JSONB,
    ADD COLUMN "output" JSONB,
    ADD COLUMN "raw_text" TEXT;

-- Les defaults ne servaient qu'aux lignes existantes.
ALTER TABLE "game_aggregation_runs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "game_aggregation_runs" ALTER COLUMN "duration_ms" DROP DEFAULT;

-- Backfill : une génération réussie par fiche déjà générée.
INSERT INTO "game_aggregation_runs" ("id", "game_id", "status", "language", "operation", "model", "duration_ms", "created_at")
SELECT gen_random_uuid(), "id", 'SUCCESS', "supported_languages"[1], 'GENERATION', "sheet_generated_by", 0, "sheet_generated_at"
FROM "games"
WHERE "sheet_generated_at" IS NOT NULL
  AND "sheet_generated_by" IS NOT NULL
  AND cardinality("supported_languages") > 0;

-- AlterTable
ALTER TABLE "games" DROP COLUMN "sheet_generated_at",
DROP COLUMN "sheet_generated_by";

-- CreateIndex
CREATE INDEX "game_aggregation_runs_game_id_operation_status_created_at_idx" ON "game_aggregation_runs"("game_id", "operation", "status", "created_at");

-- CreateIndex
CREATE INDEX "game_aggregation_runs_status_created_at_idx" ON "game_aggregation_runs"("status", "created_at");
