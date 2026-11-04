-- CreateEnum
CREATE TYPE "game_category" AS ENUM ('ABSTRACT', 'CARD', 'CHILDREN', 'FAMILY', 'PARTY', 'STRATEGY', 'THEMATIC', 'WAR');

-- CreateEnum
CREATE TYPE "rule_type" AS ENUM ('SETUP', 'TURN', 'SPECIAL', 'END_TRIGGER', 'SCORING', 'WINNER', 'TIE_BREAKER');

-- CreateEnum
CREATE TYPE "sheet_confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "bgg_id" INTEGER,
    "name" TEXT NOT NULL,
    "localized_names" JSONB,
    "description" JSONB,
    "year" INTEGER,
    "designers" TEXT[],
    "publisher" TEXT,
    "edition" TEXT,
    "image_url" TEXT,
    "categories" "game_category"[],
    "min_players" INTEGER,
    "max_players" INTEGER,
    "recommended_players" INTEGER[],
    "min_age" INTEGER,
    "min_duration_minutes" INTEGER,
    "max_duration_minutes" INTEGER,
    "turn_summary" JSONB,
    "end_timing" JSONB,
    "sheet_confidence" "sheet_confidence",
    "sheet_sources" JSONB,
    "sheet_warnings" JSONB,
    "sheet_generated_at" TIMESTAMPTZ(6),
    "sheet_generated_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_barcodes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "game_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_rules" (
    "id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "type" "rule_type" NOT NULL,
    "order" INTEGER NOT NULL,
    "player_counts" INTEGER[],
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "title" JSONB,
    "text" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "game_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "games_bgg_id_key" ON "games"("bgg_id");

-- CreateIndex
CREATE INDEX "games_name_idx" ON "games"("name");

-- CreateIndex
CREATE UNIQUE INDEX "game_barcodes_code_key" ON "game_barcodes"("code");

-- CreateIndex
CREATE INDEX "game_barcodes_game_id_idx" ON "game_barcodes"("game_id");

-- CreateIndex
CREATE INDEX "game_rules_game_id_type_order_idx" ON "game_rules"("game_id", "type", "order");

-- AddForeignKey
ALTER TABLE "game_barcodes" ADD CONSTRAINT "game_barcodes_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_rules" ADD CONSTRAINT "game_rules_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
