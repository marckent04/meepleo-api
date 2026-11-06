-- CreateTable
CREATE TABLE "user_games" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_games_user_id_idx" ON "user_games"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_games_user_id_game_id_key" ON "user_games"("user_id", "game_id");

-- AddForeignKey
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_games" ADD CONSTRAINT "user_games_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
