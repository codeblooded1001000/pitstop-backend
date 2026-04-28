-- CreateTable
CREATE TABLE "FuelPriceOverride" (
    "id" TEXT NOT NULL,
    "fuelType" "VehicleType" NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'INDIA_AVG',
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'LITER',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelPriceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FuelPriceOverride_fuelType_region_expiresAt_idx" ON "FuelPriceOverride"("fuelType", "region", "expiresAt");

