-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" SERIAL NOT NULL,
    "commodity" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "modalPrice" DOUBLE PRECISION NOT NULL,
    "minPrice" DOUBLE PRECISION NOT NULL,
    "maxPrice" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketPrice_commodity_idx" ON "MarketPrice"("commodity");
