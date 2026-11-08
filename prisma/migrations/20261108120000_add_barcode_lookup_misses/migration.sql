-- CreateTable
CREATE TABLE "barcode_lookup_misses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barcode_lookup_misses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "barcode_lookup_misses_code_key" ON "barcode_lookup_misses"("code");
