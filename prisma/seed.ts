import { CheckpointType, PrismaClient, VehicleType } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type VehicleSeedRecord = {
  name: string;
  brand: string;
  type: VehicleType;
  tankCapacity?: number | null;
  batteryCapacity?: number | null;
  realWorldRange: number;
  imageUrl?: string | null;
  popularityRank?: number;
};

type CheckpointSeedRecord = {
  name: string;
  type: CheckpointType[];
  latitude: number;
  longitude: number;
  distanceFromDelhi: number;
  highway?: string;
  corridor?: string;
  rating?: number | null;
  reviewCount?: number | null;
  hasFuel?: boolean;
  hasEVCharger?: boolean;
  evChargerType?: string | null;
  hasFood?: boolean;
  hasCleanRestroom?: boolean;
  hasParking?: boolean;
  isFamilyFriendly?: boolean;
  description?: string | null;
  highlights?: string[];
  imageUrl?: string | null;
};

const prisma = new PrismaClient();

function readJsonFileWithFallback<T>(fileName: string): T {
  const preferredPath = resolve(process.cwd(), "prisma", "data", fileName);
  const fallbackPath = resolve(process.cwd(), "src", "seed-data", fileName);

  const preferredExists = existsSync(preferredPath);
  const fallbackExists = existsSync(fallbackPath);

  if (!preferredExists && !fallbackExists) {
    throw new Error(`Missing seed data file: ${preferredPath} (and fallback: ${fallbackPath})`);
  }

  const preferredRaw = preferredExists ? readFileSync(preferredPath, "utf8") : "";
  const preferredParsed = preferredExists ? (JSON.parse(preferredRaw) as unknown) : null;

  if (Array.isArray(preferredParsed) && preferredParsed.length > 0) {
    return preferredParsed as T;
  }

  if (fallbackExists) {
    const fallbackRaw = readFileSync(fallbackPath, "utf8");
    return JSON.parse(fallbackRaw) as T;
  }

  return (preferredParsed ?? []) as T;
}

function assertVehicleType(value: string): VehicleType {
  if (!Object.values(VehicleType).includes(value as VehicleType)) {
    throw new Error(`Invalid vehicle type in seed data: ${value}`);
  }
  return value as VehicleType;
}

function assertCheckpointTypes(values: string[]): CheckpointType[] {
  return values.map((value) => {
    if (!Object.values(CheckpointType).includes(value as CheckpointType)) {
      throw new Error(`Invalid checkpoint type in seed data: ${value}`);
    }
    return value as CheckpointType;
  });
}

async function main(): Promise<void> {
  const vehiclesRaw = readJsonFileWithFallback<Array<Record<string, unknown>>>("vehicles.json");
  const checkpointsRaw = readJsonFileWithFallback<Array<Record<string, unknown>>>("checkpoints.json");

  const vehicles: VehicleSeedRecord[] = vehiclesRaw.map((item) => ({
    name: String(item.name),
    brand: String(item.brand),
    type: assertVehicleType(String(item.type)),
    tankCapacity: item.tankCapacity as number | null | undefined,
    batteryCapacity: item.batteryCapacity as number | null | undefined,
    realWorldRange: Number(item.realWorldRange),
    imageUrl: (item.imageUrl as string | null | undefined) ?? null,
    popularityRank: Number(item.popularityRank ?? 0)
  }));

  const checkpoints: CheckpointSeedRecord[] = checkpointsRaw.map((item) => ({
    name: String(item.name),
    type: assertCheckpointTypes(((item.type ?? item.types) as string[]) ?? []),
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    distanceFromDelhi: Number(item.distanceFromDelhi),
    highway: String(item.highway ?? "NH48"),
    corridor: String(item.corridor ?? "DELHI_JAIPUR"),
    rating: (item.rating as number | null | undefined) ?? null,
    reviewCount: (item.reviewCount as number | null | undefined) ?? null,
    hasFuel: Boolean(item.hasFuel ?? false),
    hasEVCharger: Boolean(item.hasEVCharger ?? false),
    evChargerType: (item.evChargerType as string | null | undefined) ?? null,
    hasFood: Boolean(item.hasFood ?? false),
    hasCleanRestroom: Boolean(item.hasCleanRestroom ?? false),
    hasParking: Boolean(item.hasParking ?? false),
    isFamilyFriendly: Boolean(item.isFamilyFriendly ?? false),
    description: (item.description as string | null | undefined) ?? null,
    highlights: Array.isArray(item.highlights)
      ? item.highlights.map((highlight) => String(highlight))
      : [],
    imageUrl: (item.imageUrl as string | null | undefined) ?? null
  }));

  await prisma.vehicle.deleteMany();
  await prisma.checkpoint.deleteMany();

  if (vehicles.length > 0) {
    await prisma.vehicle.createMany({ data: vehicles });
  }

  if (checkpoints.length > 0) {
    await prisma.checkpoint.createMany({ data: checkpoints });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${vehicles.length} vehicles and ${checkpoints.length} checkpoints`);
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
