-- AlterTable
ALTER TABLE "Checkpoint" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TripPlan" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Vehicle" ALTER COLUMN "updatedAt" DROP DEFAULT;
