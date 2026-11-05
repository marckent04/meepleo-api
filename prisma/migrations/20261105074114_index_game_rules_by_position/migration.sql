-- DropIndex
DROP INDEX "game_rules_game_id_type_order_idx";

-- CreateIndex
CREATE INDEX "game_rules_game_id_type_position_idx" ON "game_rules"("game_id", "type", "position");
