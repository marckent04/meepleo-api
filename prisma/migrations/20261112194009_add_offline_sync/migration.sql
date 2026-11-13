-- CreateEnum
CREATE TYPE "player_shape" AS ENUM ('CIRCLE', 'ROUNDED_SQUARE', 'TRIANGLE', 'DIAMOND');

-- AlterTable
ALTER TABLE "play_players" ADD COLUMN     "color" TEXT,
ADD COLUMN     "player_id" UUID,
ADD COLUMN     "shape" "player_shape";

-- AlterTable
ALTER TABLE "plays" ADD COLUMN     "duration_seconds" INTEGER,
ADD COLUMN     "ended_at" TIMESTAMPTZ(6),
ADD COLUMN     "first_player_id" UUID,
ADD COLUMN     "revision" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "started_at" TIMESTAMPTZ(6),
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "user_favorites" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "revision" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "user_games" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6),
ADD COLUMN     "revision" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "shape" "player_shape" NOT NULL,
    "handle" TEXT,
    "is_current_user" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","player_id")
);

-- CreateIndex
CREATE INDEX "players_user_id_revision_idx" ON "players"("user_id", "revision");

-- CreateIndex
CREATE INDEX "groups_user_id_revision_idx" ON "groups"("user_id", "revision");

-- CreateIndex
CREATE INDEX "plays_user_id_revision_idx" ON "plays"("user_id", "revision");

-- CreateIndex
CREATE INDEX "user_favorites_user_id_revision_idx" ON "user_favorites"("user_id", "revision");

-- CreateIndex
CREATE INDEX "user_games_user_id_revision_idx" ON "user_games"("user_id", "revision");

-- AddForeignKey
ALTER TABLE "play_players" ADD CONSTRAINT "play_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one live "current user" player per user
CREATE UNIQUE INDEX "players_user_id_current_user_key" ON "players"("user_id") WHERE "is_current_user" AND "deleted_at" IS NULL;

-- Server-side change counter shared by every synchronizable table (cursor of sync/pull)
CREATE SEQUENCE "sync_revision_seq";

CREATE FUNCTION "set_sync_revision"() RETURNS trigger AS $$
BEGIN
  NEW."revision" := nextval('sync_revision_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "players_set_revision" BEFORE INSERT OR UPDATE ON "players" FOR EACH ROW EXECUTE FUNCTION "set_sync_revision"();
CREATE TRIGGER "groups_set_revision" BEFORE INSERT OR UPDATE ON "groups" FOR EACH ROW EXECUTE FUNCTION "set_sync_revision"();
CREATE TRIGGER "plays_set_revision" BEFORE INSERT OR UPDATE ON "plays" FOR EACH ROW EXECUTE FUNCTION "set_sync_revision"();
CREATE TRIGGER "user_games_set_revision" BEFORE INSERT OR UPDATE ON "user_games" FOR EACH ROW EXECUTE FUNCTION "set_sync_revision"();
CREATE TRIGGER "user_favorites_set_revision" BEFORE INSERT OR UPDATE ON "user_favorites" FOR EACH ROW EXECUTE FUNCTION "set_sync_revision"();

-- Backfill existing rows so they appear in the first sync/pull
UPDATE "plays" SET "revision" = 0;
UPDATE "user_games" SET "revision" = 0;
UPDATE "user_favorites" SET "revision" = 0;
