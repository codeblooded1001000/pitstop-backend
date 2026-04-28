import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CheckpointType } from "@prisma/client";
import { Worker } from "bullmq";
import { GoogleMapsService } from "../../common/google-maps/google-maps.service";
import { RedisService } from "../../common/redis/redis.service";
import { sampleAlongPolyline } from "../../common/utils/polyline";
import { PrismaService } from "../../prisma/prisma.service";
import { type PoiFetchJob } from "./poi-fetcher.service";

@Injectable()
export class PoiFetcherWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<PoiFetchJob>;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly googleMaps: GoogleMapsService
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<PoiFetchJob>(
      "poi-fetch",
      async (job) => {
        await this.fetchPoisAlongRoute(job.data.encodedPolyline);
      },
      { connection: this.redis.raw }
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async fetchPoisAlongRoute(encodedPolyline: string): Promise<void> {
    const radiusMeters = Number(process.env.POI_FETCH_RADIUS_METERS ?? 5000);
    const points = sampleAlongPolyline(encodedPolyline, 20_000);
    const types: Array<"gas_station" | "restaurant" | "cafe" | "ev_charging_station"> = [
      "gas_station",
      "restaurant",
      "cafe",
      "ev_charging_station"
    ];

    for (const point of points) {
      for (const type of types) {
        const places = await this.googleMaps.placesNearby({
          lat: point.lat,
          lng: point.lng,
          radiusMeters,
          type
        });

        for (const place of places) {
          const rating = place.rating ?? 0;
          const reviews = place.userRatingsTotal ?? 0;
          if (rating < 3.8 || reviews < 30) continue;

          const checkpointTypes = mapPlaceToCheckpointTypes(type);
          const suggested = suggestedStopDurationMinutes(checkpointTypes);

          await this.prisma.checkpoint.upsert({
            where: { googlePlaceId: place.placeId },
            create: {
              googlePlaceId: place.placeId,
              name: place.name,
              type: checkpointTypes,
              latitude: place.lat,
              longitude: place.lng,
              rating: place.rating ?? null,
              reviewCount: place.userRatingsTotal ?? null,
              hasFuel: checkpointTypes.includes(CheckpointType.FUEL),
              hasEVCharger: checkpointTypes.includes(CheckpointType.EV_CHARGING),
              evChargerType: null,
              hasFood: checkpointTypes.some((t) => t === CheckpointType.RESTAURANT || t === CheckpointType.DHABA || t === CheckpointType.CAFE),
              hasCleanRestroom: false,
              hasParking: false,
              isFamilyFriendly: false,
              description: null,
              highlights: [],
              imageUrl: null,
              source: "GOOGLE_PLACES",
              lastVerifiedAt: new Date(),
              isActive: true,
              suggestedStopDuration: suggested
            },
            update: {
              name: place.name,
              latitude: place.lat,
              longitude: place.lng,
              rating: place.rating ?? null,
              reviewCount: place.userRatingsTotal ?? null,
              type: checkpointTypes,
              hasFuel: checkpointTypes.includes(CheckpointType.FUEL),
              hasEVCharger: checkpointTypes.includes(CheckpointType.EV_CHARGING),
              hasFood: checkpointTypes.some((t) => t === CheckpointType.RESTAURANT || t === CheckpointType.DHABA || t === CheckpointType.CAFE),
              lastVerifiedAt: new Date(),
              isActive: true,
              suggestedStopDuration: suggested
            }
          });
        }

        // Gentle rate limiting
        await sleep(120);
      }
    }
  }
}

function mapPlaceToCheckpointTypes(
  type: "gas_station" | "restaurant" | "cafe" | "ev_charging_station"
): CheckpointType[] {
  switch (type) {
    case "gas_station":
      return [CheckpointType.FUEL];
    case "ev_charging_station":
      return [CheckpointType.EV_CHARGING];
    case "cafe":
      return [CheckpointType.CAFE];
    case "restaurant":
      return [CheckpointType.RESTAURANT];
    default:
      return [];
  }
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

