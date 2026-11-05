-- AlterTable
ALTER TABLE "games" ADD COLUMN     "supported_languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
