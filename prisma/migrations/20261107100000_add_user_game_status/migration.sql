-- CreateEnum
CREATE TYPE "user_game_status" AS ENUM ('OWNED', 'WISHLIST');

-- AlterTable
ALTER TABLE "user_games" ADD COLUMN "status" "user_game_status" NOT NULL DEFAULT 'OWNED';

-- DropIndex
DROP INDEX "user_games_user_id_idx";

-- CreateIndex
CREATE INDEX "user_games_user_id_status_idx" ON "user_games"("user_id", "status");
