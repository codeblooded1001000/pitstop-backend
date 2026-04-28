import { Injectable } from "@nestjs/common";
import { Prisma, Route } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { GoogleMapsService } from "../../common/google-maps/google-maps.service";
import { buildRouteHash } from "../../common/utils/route-hash";

@Injectable()
export class RouteFinderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleMaps: GoogleMapsService
  ) {}

  async getRoute(params: {
    origin: { lat: number; lng: number; address?: string };
    destination: { lat: number; lng: number; address?: string };
  }): Promise<Route> {
    const routeHash = buildRouteHash({
      originLat: params.origin.lat,
      originLng: params.origin.lng,
      destinationLat: params.destination.lat,
      destinationLng: params.destination.lng
    });

    const now = new Date();
    const cached = await this.prisma.route.findUnique({ where: { routeHash } });
    if (cached && cached.expiresAt > now) {
      return cached;
    }

    const ttlDays = Number(process.env.ROUTE_CACHE_TTL_DAYS ?? 30);
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    const directions = await this.googleMaps.directions(
      { lat: params.origin.lat, lng: params.origin.lng },
      { lat: params.destination.lat, lng: params.destination.lng }
    );

    const originAddress = params.origin.address ?? directions.originAddress ?? null;
    const destinationAddress = params.destination.address ?? directions.destinationAddress ?? null;

    return this.prisma.route.upsert({
      where: { routeHash },
      create: {
        routeHash,
        originLat: params.origin.lat,
        originLng: params.origin.lng,
        destinationLat: params.destination.lat,
        destinationLng: params.destination.lng,
        originAddress,
        destinationAddress,
        distanceMeters: directions.distanceMeters,
        durationSeconds: directions.durationSeconds,
        encodedPolyline: directions.encodedPolyline,
        legs: directions.legs as unknown as Prisma.InputJsonValue,
        expiresAt
      },
      update: {
        originAddress,
        destinationAddress,
        distanceMeters: directions.distanceMeters,
        durationSeconds: directions.durationSeconds,
        encodedPolyline: directions.encodedPolyline,
        legs: directions.legs as unknown as Prisma.InputJsonValue,
        fetchedAt: now,
        expiresAt
      }
    });
  }
}

