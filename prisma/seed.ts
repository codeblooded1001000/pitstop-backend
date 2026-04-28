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
  googlePlaceId?: string | null;
  name: string;
  type: CheckpointType[];
  latitude: number;
  longitude: number;
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

function suggestedStopDurationMinutes(types: CheckpointType[]): number {
  const perType: Record<CheckpointType, number> = {
    [CheckpointType.FUEL]: 10,
    [CheckpointType.EV_CHARGING]: 30,
    [CheckpointType.CAFE]: 15,
    [CheckpointType.DHABA]: 30,
    [CheckpointType.RESTAURANT]: 30,
    [CheckpointType.REST_AREA]: 15
  };
  return Math.max(...types.map((t) => perType[t] ?? 15), 15);
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
    googlePlaceId: (item.googlePlaceId as string | null | undefined) ?? null,
    name: String(item.name),
    type: assertCheckpointTypes(((item.type ?? item.types) as string[]) ?? []),
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
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
    const now = new Date();
    await prisma.checkpoint.createMany({
      data: checkpoints.map((c) => ({
        googlePlaceId: c.googlePlaceId ?? null,
        name: c.name,
        type: c.type,
        latitude: c.latitude,
        longitude: c.longitude,
        rating: c.rating ?? null,
        reviewCount: c.reviewCount ?? null,
        hasFuel: Boolean(c.hasFuel ?? false),
        hasEVCharger: Boolean(c.hasEVCharger ?? false),
        evChargerType: c.evChargerType ?? null,
        hasFood: Boolean(c.hasFood ?? false),
        hasCleanRestroom: Boolean(c.hasCleanRestroom ?? false),
        hasParking: Boolean(c.hasParking ?? false),
        isFamilyFriendly: Boolean(c.isFamilyFriendly ?? false),
        description: c.description ?? null,
        highlights: c.highlights ?? [],
        imageUrl: c.imageUrl ?? null,
        source: "MANUAL",
        lastVerifiedAt: now,
        isActive: true,
        suggestedStopDuration: suggestedStopDurationMinutes(c.type)
      }))
    });
  }

  await seedFuelPriceOverrides();

  // eslint-disable-next-line no-console
  console.log(`Seeded ${vehicles.length} vehicles, ${checkpoints.length} checkpoints, and fuel price overrides`);
}

async function seedFuelPriceOverrides(): Promise<void> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const defaults: Array<{ fuelType: VehicleType; pricePerUnit: number; unit: string }> = [
    { fuelType: VehicleType.PETROL, pricePerUnit: 95, unit: "LITER" },
    { fuelType: VehicleType.DIESEL, pricePerUnit: 88, unit: "LITER" },
    { fuelType: VehicleType.EV, pricePerUnit: 8, unit: "KWH" },
    { fuelType: VehicleType.HYBRID, pricePerUnit: 95, unit: "LITER" },
    { fuelType: VehicleType.CNG, pricePerUnit: 78, unit: "KG" }
  ];

  try {
    await prisma.fuelPriceOverride.deleteMany({
      where: {
        region: "INDIA_AVG",
        source: "seed-default"
      }
    });

    await prisma.fuelPriceOverride.createMany({
      data: defaults.map((item) => ({
        fuelType: item.fuelType,
        region: "INDIA_AVG",
        pricePerUnit: item.pricePerUnit,
        unit: item.unit,
        source: "seed-default",
        expiresAt
      }))
    });
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code !== "P2021") {
      throw error;
    }
    // Table doesn't exist yet; keep seed backward-compatible.
  }
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
