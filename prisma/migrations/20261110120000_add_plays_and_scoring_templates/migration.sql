-- CreateEnum
CREATE TYPE "play_status" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- AlterEnum
ALTER TYPE "game_aggregation_operation" ADD VALUE 'SCORING';

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "scoring_template" JSONB;

-- CreateTable
CREATE TABLE "plays" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "status" "play_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "played_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "scoring" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "plays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_players" (
    "id" UUID NOT NULL,
    "play_id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "side" INTEGER NOT NULL,
    "total" INTEGER,
    "rank" INTEGER,
    "is_winner" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "play_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_scores" (
    "id" UUID NOT NULL,
    "play_id" UUID NOT NULL,
    "side" INTEGER NOT NULL,
    "row_key" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "play_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plays_user_id_played_at_idx" ON "plays"("user_id", "played_at");

-- CreateIndex
CREATE INDEX "plays_user_id_game_id_played_at_idx" ON "plays"("user_id", "game_id", "played_at");

-- CreateIndex
CREATE INDEX "play_players_user_id_idx" ON "play_players"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "play_players_play_id_position_key" ON "play_players"("play_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "play_scores_play_id_side_row_key_round_key" ON "play_scores"("play_id", "side", "row_key", "round");

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_players" ADD CONSTRAINT "play_players_play_id_fkey" FOREIGN KEY ("play_id") REFERENCES "plays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_players" ADD CONSTRAINT "play_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_scores" ADD CONSTRAINT "play_scores_play_id_fkey" FOREIGN KEY ("play_id") REFERENCES "plays"("id") ON DELETE CASCADE ON UPDATE CASCADE;

