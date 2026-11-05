-- CreateEnum
CREATE TYPE "game_aggregation_operation" AS ENUM ('GENERATION', 'TRANSLATION');

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "rule_book_url" TEXT;

-- CreateTable
CREATE TABLE "game_aggregation_errors" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "operation" "game_aggregation_operation",
    "source_language" TEXT,
    "model" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_aggregation_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_aggregation_errors_game_id_created_at_idx" ON "game_aggregation_errors"("game_id", "created_at");

-- AddForeignKey
ALTER TABLE "game_aggregation_errors" ADD CONSTRAINT "game_aggregation_errors_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
