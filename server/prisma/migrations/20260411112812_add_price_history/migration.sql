-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" SERIAL NOT NULL,
    "marketPriceId" INTEGER NOT NULL,
    "modalPrice" DOUBLE PRECISION NOT NULL,
    "minPrice" DOUBLE PRECISION NOT NULL,
    "maxPrice" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceHistory_marketPriceId_idx" ON "PriceHistory"("marketPriceId");

-- CreateIndex
CREATE INDEX "MarketPrice_district_idx" ON "MarketPrice"("district");

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_marketPriceId_fkey" FOREIGN KEY ("marketPriceId") REFERENCES "MarketPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
