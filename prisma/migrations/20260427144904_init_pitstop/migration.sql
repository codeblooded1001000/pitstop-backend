-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('PETROL', 'DIESEL', 'EV', 'HYBRID');

-- CreateEnum
CREATE TYPE "CheckpointType" AS ENUM ('FUEL', 'EV_CHARGING', 'DHABA', 'RESTAURANT', 'REST_AREA', 'CAFE');

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "tankCapacity" DOUBLE PRECISION,
    "batteryCapacity" DOUBLE PRECISION,
    "realWorldRange" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT,
    "popularityRank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CheckpointType"[],
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "distanceFromDelhi" DOUBLE PRECISION NOT NULL,
    "highway" TEXT NOT NULL DEFAULT 'NH48',
    "corridor" TEXT NOT NULL DEFAULT 'DELHI_JAIPUR',
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "hasFuel" BOOLEAN NOT NULL DEFAULT false,
    "hasEVCharger" BOOLEAN NOT NULL DEFAULT false,
    "evChargerType" TEXT,
    "hasFood" BOOLEAN NOT NULL DEFAULT false,
    "hasCleanRestroom" BOOLEAN NOT NULL DEFAULT false,
    "hasParking" BOOLEAN NOT NULL DEFAULT false,
    "isFamilyFriendly" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "highlights" TEXT[],
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);
