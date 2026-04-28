-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- AlterTable
ALTER TABLE "Checkpoint"
  DROP COLUMN "corridor",
  DROP COLUMN "distanceFromDelhi",
  DROP COLUMN "highway",
  ADD COLUMN "googlePlaceId" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'GOOGLE_PLACES',
  ADD COLUMN "suggestedStopDuration" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Vehicle"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "routeHash" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destinationLat" DOUBLE PRECISION NOT NULL,
    "destinationLng" DOUBLE PRECISION NOT NULL,
    "originAddress" TEXT,
    "destinationAddress" TEXT,
    "distanceMeters" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "encodedPolyline" TEXT NOT NULL,
    "legs" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPlan" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fuelPercent" DOUBLE PRECISION NOT NULL,
    "departureTime" TIMESTAMP(3) NOT NULL,
    "selectedCheckpointIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckpointFeedback" (
    "id" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckpointFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Route_routeHash_key" ON "Route"("routeHash");

-- CreateIndex
CREATE INDEX "Route_routeHash_idx" ON "Route"("routeHash");

-- CreateIndex
CREATE INDEX "Route_expiresAt_idx" ON "Route"("expiresAt");

-- CreateIndex
CREATE INDEX "TripPlan_routeId_idx" ON "TripPlan"("routeId");

-- CreateIndex
CREATE INDEX "CheckpointFeedback_checkpointId_idx" ON "CheckpointFeedback"("checkpointId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkpoint_googlePlaceId_key" ON "Checkpoint"("googlePlaceId");

-- CreateIndex
CREATE INDEX "Checkpoint_latitude_longitude_idx" ON "Checkpoint"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Checkpoint_isActive_idx" ON "Checkpoint"("isActive");

-- CreateIndex
CREATE INDEX "Checkpoint_lastVerifiedAt_idx" ON "Checkpoint"("lastVerifiedAt");

-- CreateIndex
CREATE INDEX "Vehicle_popularityRank_idx" ON "Vehicle"("popularityRank");

-- CreateIndex
CREATE INDEX "Vehicle_type_idx" ON "Vehicle"("type");

