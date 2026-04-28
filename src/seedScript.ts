import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface VehicleSeed {
  name: string;
  brand: string;
  type: 'PETROL' | 'DIESEL' | 'EV' | 'HYBRID';
  tankCapacity: number | null;
  batteryCapacity: number | null;
  realWorldRange: number;
  imageUrl: string | null;
  popularityRank: number;
}

interface CheckpointSeed {
  googlePlaceId?: string | null;
  name: string;
  types: Array<'FUEL' | 'EV_CHARGING' | 'DHABA' | 'RESTAURANT' | 'REST_AREA' | 'CAFE'>;
  latitude: number;
  longitude: number;
  rating: number | null;
  reviewCount: number | null;
  hasFuel: boolean;
  hasEVCharger: boolean;
  evChargerType: string | null;
  hasFood: boolean;
  hasCleanRestroom: boolean;
  hasParking: boolean;
  isFamilyFriendly: boolean;
  description: string | null;
  highlights: string[];
  imageUrl: string | null;
}

function suggestedStopDurationMinutes(types: CheckpointSeed["types"]): number {
  const perType: Record<CheckpointSeed["types"][number], number> = {
    FUEL: 10,
    EV_CHARGING: 30,
    CAFE: 15,
    DHABA: 30,
    RESTAURANT: 30,
    REST_AREA: 15,
  };
  return Math.max(...types.map((t) => perType[t] ?? 15), 15);
}

function loadJson<T>(filename: string): T {
  const prismaPath = path.resolve(process.cwd(), 'prisma', 'data', filename);
  const srcPath = path.resolve(__dirname, 'seed-data', filename);

  const prismaExists = fs.existsSync(prismaPath);
  const srcExists = fs.existsSync(srcPath);

  if (!prismaExists && !srcExists) {
    throw new Error(`Seed data file not found in prisma/data or src/seed-data: ${filename}`);
  }

  const prismaRaw = prismaExists ? fs.readFileSync(prismaPath, 'utf-8') : '';
  const prismaParsed = prismaExists ? (JSON.parse(prismaRaw) as unknown) : null;

  if (Array.isArray(prismaParsed) && prismaParsed.length > 0) {
    return prismaParsed as T;
  }

  if (srcExists) {
    const raw = fs.readFileSync(srcPath, 'utf-8');
    return JSON.parse(raw) as T;
  }

  return (prismaParsed ?? []) as T;
}

async function seedVehicles() {
  console.log('🚗 Seeding vehicles...');
  const vehicles = loadJson<VehicleSeed[]>('vehicles.json');

  // Clear existing
  await prisma.vehicle.deleteMany({});

  let count = 0;
  for (const v of vehicles) {
    await prisma.vehicle.create({
      data: {
        name: v.name,
        brand: v.brand,
        type: v.type,
        tankCapacity: v.tankCapacity,
        batteryCapacity: v.batteryCapacity,
        realWorldRange: v.realWorldRange,
        imageUrl: v.imageUrl,
        popularityRank: v.popularityRank,
      },
    });
    count++;
  }
  console.log(`✅ Seeded ${count} vehicles`);
}

async function seedCheckpoints() {
  console.log('📍 Seeding checkpoints...');
  const checkpoints = loadJson<CheckpointSeed[]>('checkpoints.json');

  // Clear existing
  // await prisma.checkpoint.deleteMany({});

  let count = 0;
  for (const c of checkpoints) {
    await prisma.checkpoint.create({
      data: {
        googlePlaceId: c.googlePlaceId ?? null,
        name: c.name,
        type: c.types,
        latitude: c.latitude,
        longitude: c.longitude,
        rating: c.rating,
        reviewCount: c.reviewCount,
        hasFuel: c.hasFuel,
        hasEVCharger: c.hasEVCharger,
        evChargerType: c.evChargerType,
        hasFood: c.hasFood,
        hasCleanRestroom: c.hasCleanRestroom,
        hasParking: c.hasParking,
        isFamilyFriendly: c.isFamilyFriendly,
        description: c.description,
        highlights: c.highlights,
        imageUrl: c.imageUrl,
        source: 'MANUAL',
        lastVerifiedAt: new Date(),
        isActive: true,
        suggestedStopDuration: suggestedStopDurationMinutes(c.types),
      },
    });
    count++;
  }
  console.log(`✅ Seeded ${count} checkpoints`);
}

async function main() {
  console.log('🌱 Starting Pitstop seed...\n');
  try {
    await seedVehicles();
    await seedCheckpoints();
    console.log('\n🎉 Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });