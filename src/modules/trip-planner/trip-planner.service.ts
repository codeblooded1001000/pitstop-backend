import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Checkpoint, CheckpointType, Vehicle, VehicleType } from "@prisma/client";
import { GoogleMapsService } from "../../common/google-maps/google-maps.service";
import { CandidateAlongRoute, rankCheckpointsForTrip } from "../../common/utils/checkpoint-ranker";
import { calculateETAs } from "../../common/utils/eta-calculator";
import { findCheckpointsAlongRoute } from "../../common/utils/poi-along-route";
import { calculateRangeSummary } from "../../common/utils/range-calculator";
import { PrismaService } from "../../prisma/prisma.service";
// import { VehiclesService } from "../vehicles/vehicles.service";
import { PlanTripV2Dto } from "./dto/plan-trip-v2.dto";
import { RouteFinderService } from "./route-finder.service";

type SupportedVehicleType = VehicleType | "CNG";

export type TripPlanResponseV2 = {
  tripPlanId: string;
  trip: {
    originAddress: string;
    destinationAddress: string;
    originLat: number;
    originLng: number;
    destinationLat: number;
    destinationLng: number;
    totalDistanceKm: number;
    totalDurationMinutes: number;
    departureTime: string;
    estimatedArrival: string;
    encodedPolyline: string;
    googleMapsUrl: string;
  };
  vehicle: {
    name: string;
    currentRangeKm: number;
    needsRefuel: boolean;
    refuelByKm: number | null;
  };
  checkpoints: Array<{
    id: string;
    name: string;
    types: string[];
    lat: number;
    lng: number;
    distanceFromOriginKm: number;
    distanceFromPreviousKm: number;
    drivingTimeFromStartMinutes: number;
    stopDurationMinutes: number;
    arrivalTime: string;
    departureTime: string;
    reasoning: string;
    priority: "REQUIRED" | "RECOMMENDED" | "OPTIONAL";
    rating: number | null;
    lastVerifiedAt: string;
  }>;
  warnings: string[];
};

@Injectable()
export class TripPlannerService {
  constructor(
    private readonly prisma: PrismaService,
    // private readonly vehiclesService: VehiclesService,
    private readonly googleMaps: GoogleMapsService,
    private readonly routeFinder: RouteFinderService
  ) {}

  async planTripV2(dto: PlanTripV2Dto): Promise<TripPlanResponseV2> {
    const departureDate = new Date(dto.departureTime);
    if (Number.isNaN(departureDate.getTime())) {
      throw new BadRequestException("Invalid departure time");
    }

    const origin = await this.resolveLocation(dto.origin, "origin");
    const destination = await this.resolveLocation(dto.destination, "destination");

    const vehicle = await this.resolveVehicleForPlanning(dto.vehicleType);

    const route = await this.routeFinder.getRoute({
      origin,
      destination
    });

    const totalDistanceKm = round2(route.distanceMeters / 1000);
    const totalDurationMinutes = Math.round(route.durationSeconds / 60);

    const minTripKm = Number(process.env.MIN_TRIP_DISTANCE_KM ?? 80);
    if (totalDistanceKm < minTripKm) {
      const googleMapsUrl = buildGoogleMapsUrl(
        { lat: origin.lat, lng: origin.lng },
        { lat: destination.lat, lng: destination.lng },
        []
      );
      throw new UnprocessableEntityException({
        error: "TRIP_TOO_SHORT",
        message: `This trip is just ${Math.round(totalDistanceKm)} km — short enough to drive straight through. Pitstop is built for longer journeys.`,
        totalDistanceKm: Math.round(totalDistanceKm),
        googleMapsUrl
      });
    }

    const radiusMeters = Number(process.env.POI_FETCH_RADIUS_METERS ?? 5000);
    const alongRoute = await findCheckpointsAlongRoute({
      prisma: this.prisma,
      encodedPolyline: route.encodedPolyline,
      radiusMeters
    });

    const candidates: CandidateAlongRoute[] = alongRoute.map((item) => ({
      checkpoint: item.checkpoint as unknown as Checkpoint,
      distanceFromOriginKm: round2(item.fractionAlongRoute * totalDistanceKm)
    }));

    const range = calculateRangeSummary(vehicle, dto.fuelPercent, totalDistanceKm);
    const ranked = rankCheckpointsForTrip({
      vehicle,
      candidatesAlongRoute: candidates,
      totalDistanceKm,
      fuelPercent: dto.fuelPercent,
      preferences: dto.preferences
    });

    const selectedMeta = new Map(
      candidates.map((c) => [c.checkpoint.id, c.distanceFromOriginKm] as const)
    );

    const timed = calculateETAs({
      departureTime: departureDate,
      totalDistanceKm,
      totalDurationMinutes,
      checkpoints: ranked.map((r) => ({
        distanceFromOriginKm: selectedMeta.get(r.checkpoint.id) ?? 0,
        stopDurationMinutes: r.checkpoint.suggestedStopDuration
      }))
    });

    const responseCheckpoints = ranked.map((r, index) => {
      const t = timed.checkpoints[index];
      const distanceFromOriginKm = selectedMeta.get(r.checkpoint.id) ?? 0;
      return {
        id: r.checkpoint.id,
        name: r.checkpoint.name,
        types: r.checkpoint.type,
        lat: r.checkpoint.latitude,
        lng: r.checkpoint.longitude,
        distanceFromOriginKm,
        distanceFromPreviousKm: t?.distanceFromPreviousKm ?? 0,
        drivingTimeFromStartMinutes: t?.drivingTimeFromStartMinutes ?? 0,
        stopDurationMinutes: t?.stopDurationMinutes ?? r.checkpoint.suggestedStopDuration,
        arrivalTime: t?.arrivalTimeIso ?? departureDate.toISOString(),
        departureTime: t?.departureTimeIso ?? departureDate.toISOString(),
        reasoning: r.reasoning,
        priority: r.priority,
        rating: r.checkpoint.rating,
        lastVerifiedAt: r.checkpoint.lastVerifiedAt.toISOString()
      };
    });

    const tripPlan = await this.prisma.tripPlan.create({
      data: {
        routeId: route.id,
        vehicleId: vehicle.id,
        fuelPercent: dto.fuelPercent,
        departureTime: departureDate,
        selectedCheckpointIds: ranked.map((r) => r.checkpoint.id)
      }
    });

    const googleMapsUrl = buildGoogleMapsUrl(
      { lat: route.originLat, lng: route.originLng },
      { lat: route.destinationLat, lng: route.destinationLng },
      responseCheckpoints
    );

    return {
      tripPlanId: tripPlan.id,
      trip: {
        originAddress: route.originAddress ?? origin.display,
        destinationAddress: route.destinationAddress ?? destination.display,
        originLat: route.originLat,
        originLng: route.originLng,
        destinationLat: route.destinationLat,
        destinationLng: route.destinationLng,
        totalDistanceKm,
        totalDurationMinutes: timed.totalDurationMinutes,
        departureTime: departureDate.toISOString(),
        estimatedArrival: timed.estimatedArrivalIso,
        encodedPolyline: route.encodedPolyline,
        googleMapsUrl
      },
      vehicle: {
        name: vehicle.name,
        currentRangeKm: range.currentRangeKm,
        needsRefuel: range.needsRefuel,
        refuelByKm: range.refuelByKm
      },
      checkpoints: responseCheckpoints,
      warnings: []
    };
  }

  async nearbyCheckpoints(tripPlanId: string): Promise<{
    available: Array<{
      id: string;
      name: string;
      fullAddress: string;
      types: string[];
      lat: number;
      lng: number;
      duration: number;
      distanceFromOriginKm: number;
      distanceFromRouteMeters: number;
      rating: number | null;
    }>;
  }> {
    const plan = await this.prisma.tripPlan.findUnique({ where: { id: tripPlanId } });
    if (!plan) throw new NotFoundException("Trip plan not found");
    const route = await this.prisma.route.findUnique({ where: { id: plan.routeId } });
    if (!route) throw new NotFoundException("Route not found");

    const radiusMeters = Number(process.env.POI_FETCH_RADIUS_METERS ?? 5000);
    const alongRoute = await findCheckpointsAlongRoute({
      prisma: this.prisma,
      encodedPolyline: route.encodedPolyline,
      radiusMeters
    });

    const totalDistanceKm = route.distanceMeters / 1000;
    const selected = new Set(plan.selectedCheckpointIds ?? []);

    const available = alongRoute
      .filter((item) => !selected.has(item.checkpoint.id))
      .map((item) => ({
        id: item.checkpoint.id,
        name: item.checkpoint.name,
        fullAddress: item.checkpoint.fullAddress ?? item.checkpoint.name,
        types: item.checkpoint.type,
        lat: item.checkpoint.latitude,
        lng: item.checkpoint.longitude,
        duration: item.checkpoint.suggestedStopDuration,
        distanceFromOriginKm: round2(item.fractionAlongRoute * totalDistanceKm),
        distanceFromRouteMeters: Math.round(item.distanceFromRouteMeters),
        rating: item.checkpoint.rating
      }));

    return { available };
  }

  async addCheckpoint(params: { tripPlanId: string; checkpointId: string }): Promise<TripPlanResponseV2> {
    await this.updateTripPlanSelection({
      tripPlanId: params.tripPlanId,
      checkpointId: params.checkpointId,
      op: "add"
    });
    return this.getTripPlan(params.tripPlanId);
  }

  async addCheckpointFlexible(params: {
    tripPlanId: string;
    checkpointId?: string;
    custom?: { type?: string; lat: number; lng: number; name: string };
    afterCheckpointId?: string;
  }): Promise<TripPlanResponseV2> {
    let checkpointId = params.checkpointId;

    if (!checkpointId && params.custom) {
      const created = await this.prisma.checkpoint.create({
        data: {
          name: params.custom.name,
          type: mapFrontendTypeToCheckpointTypes(params.custom.type),
          latitude: params.custom.lat,
          longitude: params.custom.lng,
          rating: null,
          reviewCount: null,
          hasFuel: params.custom.type === "fuel",
          hasEVCharger: params.custom.type === "ev",
          evChargerType: null,
          hasFood: params.custom.type === "food",
          hasCleanRestroom: params.custom.type === "rest",
          hasParking: true,
          isFamilyFriendly: false,
          description: null,
          highlights: [],
          imageUrl: null,
          source: "MANUAL",
          lastVerifiedAt: new Date(),
          isActive: true,
          suggestedStopDuration: inferStopDuration(params.custom.type)
        }
      });
      checkpointId = created.id;
    }

    if (!checkpointId) {
      throw new BadRequestException("checkpointId or custom checkpoint payload is required");
    }

    await this.updateTripPlanSelection({
      tripPlanId: params.tripPlanId,
      checkpointId,
      op: "add"
    });

    if (params.afterCheckpointId) {
      const plan = await this.prisma.tripPlan.findUnique({ where: { id: params.tripPlanId } });
      if (plan) {
        const reordered = moveAfter(plan.selectedCheckpointIds ?? [], checkpointId, params.afterCheckpointId);
        await this.prisma.tripPlan.update({
          where: { id: params.tripPlanId },
          data: { selectedCheckpointIds: reordered }
        });
      }
    }

    return this.getTripPlan(params.tripPlanId);
  }

  async getTripPlanById(tripPlanId: string): Promise<TripPlanResponseV2> {
    return this.getTripPlan(tripPlanId);
  }

  async removeCheckpoint(params: { tripPlanId: string; checkpointId: string }): Promise<TripPlanResponseV2> {
    await this.updateTripPlanSelection({
      tripPlanId: params.tripPlanId,
      checkpointId: params.checkpointId,
      op: "remove"
    });
    return this.getTripPlan(params.tripPlanId);
  }

  private async getTripPlan(tripPlanId: string): Promise<TripPlanResponseV2> {
    const plan = await this.prisma.tripPlan.findUnique({ where: { id: tripPlanId } });
    if (!plan) throw new NotFoundException("Trip plan not found");
    const route = await this.prisma.route.findUnique({ where: { id: plan.routeId } });
    if (!route) throw new NotFoundException("Route not found");
    const vehicle = await this.resolveVehicleByStoredId(plan.vehicleId);

    const totalDistanceKm = round2(route.distanceMeters / 1000);
    const totalDurationMinutes = Math.round(route.durationSeconds / 60);

    const radiusMeters = Number(process.env.POI_FETCH_RADIUS_METERS ?? 5000);
    const alongRoute = await findCheckpointsAlongRoute({
      prisma: this.prisma,
      encodedPolyline: route.encodedPolyline,
      radiusMeters
    });

    const byId = new Map(alongRoute.map((i) => [i.checkpoint.id, i] as const));
    const selectedIds = plan.selectedCheckpointIds ?? [];
    const selectedAlong = selectedIds.map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));

    const range = calculateRangeSummary(vehicle, plan.fuelPercent, totalDistanceKm);

    const ranked = selectedAlong.map((item) => ({
      checkpoint: item.checkpoint as unknown as Checkpoint,
      priority: "RECOMMENDED" as const,
      reasoning: "User-selected stop."
    }));

    const etaBaseTime = getEtaBaseTime(plan.departureTime);

    const timed = calculateETAs({
      departureTime: etaBaseTime,
      totalDistanceKm,
      totalDurationMinutes,
      checkpoints: selectedAlong.map((item) => ({
        distanceFromOriginKm: round2(item.fractionAlongRoute * totalDistanceKm),
        stopDurationMinutes: item.checkpoint.suggestedStopDuration
      }))
    });

    const responseCheckpoints = ranked.map((r, index) => {
      const item = selectedAlong[index];
      const t = timed.checkpoints[index];
      const distanceFromOriginKm = item ? round2(item.fractionAlongRoute * totalDistanceKm) : 0;
      return {
        id: r.checkpoint.id,
        name: r.checkpoint.name,
        types: r.checkpoint.type,
        lat: r.checkpoint.latitude,
        lng: r.checkpoint.longitude,
        distanceFromOriginKm,
        distanceFromPreviousKm: t?.distanceFromPreviousKm ?? 0,
        drivingTimeFromStartMinutes: t?.drivingTimeFromStartMinutes ?? 0,
        stopDurationMinutes: t?.stopDurationMinutes ?? r.checkpoint.suggestedStopDuration,
        arrivalTime: t?.arrivalTimeIso ?? plan.departureTime.toISOString(),
        departureTime: t?.departureTimeIso ?? plan.departureTime.toISOString(),
        reasoning: r.reasoning,
        priority: r.priority,
        rating: r.checkpoint.rating,
        lastVerifiedAt: r.checkpoint.lastVerifiedAt.toISOString()
      };
    }).sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime());

    const originDisplay = route.originAddress ?? `${route.originLat},${route.originLng}`;
    const destDisplay = route.destinationAddress ?? `${route.destinationLat},${route.destinationLng}`;

    const googleMapsUrl = buildGoogleMapsUrl(
      { lat: route.originLat, lng: route.originLng },
      { lat: route.destinationLat, lng: route.destinationLng },
      responseCheckpoints
    );

    return {
      tripPlanId: plan.id,
      trip: {
        originAddress: originDisplay,
        destinationAddress: destDisplay,
        originLat: route.originLat,
        originLng: route.originLng,
        destinationLat: route.destinationLat,
        destinationLng: route.destinationLng,
        totalDistanceKm,
        totalDurationMinutes: timed.totalDurationMinutes,
        departureTime: etaBaseTime.toISOString(),
        estimatedArrival: timed.estimatedArrivalIso,
        encodedPolyline: route.encodedPolyline,
        googleMapsUrl
      },
      vehicle: {
        name: vehicle.name,
        currentRangeKm: range.currentRangeKm,
        needsRefuel: range.needsRefuel,
        refuelByKm: range.refuelByKm
      },
      checkpoints: responseCheckpoints,
      warnings: []
    };
  }

  private async resolveVehicleForPlanning(
    // vehicleId?: string,
    vehicleType?: "PETROL" | "DIESEL" | "EV" | "HYBRID" | "CNG"
  ): Promise<Vehicle> {
    // if (vehicleId) {
    //   const vehicle = await this.vehiclesService.getVehicleById(vehicleId);
    //   if (!vehicle) throw new NotFoundException("Vehicle not found");
    //   return vehicle;
    // }

    if (!vehicleType) {
      throw new BadRequestException("Either vehicleId or vehicleType is required");
    }

    return buildVirtualVehicle(vehicleType as SupportedVehicleType);
  }

  private async resolveVehicleByStoredId(vehicleId: string): Promise<{
    name: string;
    id: string;
    type: VehicleType;
    imageUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    brand: string;
    tankCapacity: number | null;
    batteryCapacity: number | null;
    realWorldRange: number;
    popularityRank: number;
  }> {
    if (vehicleId.startsWith("VIRTUAL_")) {
      const type = vehicleId.replace("VIRTUAL_", "") as SupportedVehicleType;
      return buildVirtualVehicle(type);
    }
    return this.resolveVehicleForPlanning(undefined);
  }

  private async updateTripPlanSelection(params: {
    tripPlanId: string;
    checkpointId: string;
    op: "add" | "remove";
  }): Promise<void> {
    const plan = await this.prisma.tripPlan.findUnique({ where: { id: params.tripPlanId } });
    if (!plan) throw new NotFoundException("Trip plan not found");
    const route = await this.prisma.route.findUnique({ where: { id: plan.routeId } });
    if (!route) throw new NotFoundException("Route not found");

    const selected = plan.selectedCheckpointIds ?? [];

    if (params.op === "remove") {
      const next = selected.filter((id) => id !== params.checkpointId);
      await this.prisma.tripPlan.update({
        where: { id: plan.id },
        data: { selectedCheckpointIds: next }
      });
      return;
    }

    const radiusMeters = Number(process.env.POI_FETCH_RADIUS_METERS ?? 5000);
    const alongRoute = await findCheckpointsAlongRoute({
      prisma: this.prisma,
      encodedPolyline: route.encodedPolyline,
      radiusMeters
    });

    const byId = new Map(alongRoute.map((i) => [i.checkpoint.id, i] as const));
    const candidate = byId.get(params.checkpointId);
    if (!candidate) {
      throw new BadRequestException("Checkpoint is not within route buffer");
    }

    const unique = Array.from(new Set([...selected, params.checkpointId]));
    const sortable = unique
      .map((id) => ({ id, fraction: byId.get(id)?.fractionAlongRoute }))
      .filter((x): x is { id: string; fraction: number } => typeof x.fraction === "number");

    sortable.sort((a, b) => a.fraction - b.fraction);
    const sortedIds = sortable.map((s) => s.id);

    await this.prisma.tripPlan.update({
      where: { id: plan.id },
      data: { selectedCheckpointIds: sortedIds }
    });
  }

  private async resolveLocation(
    input: { lat?: number; lng?: number; address?: string; name?: string },
    label: "origin" | "destination"
  ): Promise<{ lat: number; lng: number; display: string; address?: string }> {
    const lat = input.lat;
    const lng = input.lng;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      validateLatLng(lat as number, lng as number, label);
      return {
        lat: lat as number,
        lng: lng as number,
        display: input.address ?? input.name ?? `${lat},${lng}`,
        address: input.address
      };
    }

    if (input.address) {
      const geo = await this.googleMaps.geocodeAddress(input.address);
      validateLatLng(geo.lat, geo.lng, label);
      return { lat: geo.lat, lng: geo.lng, display: geo.formattedAddress, address: geo.formattedAddress };
    }

    throw new BadRequestException(`Missing ${label} coordinates or address`);
  }
}

function buildGoogleMapsUrl(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  checkpoints: Array<{ lat: number; lng: number }>
): string {
  const baseUrl = "https://www.google.com/maps/dir/?api=1";
  const waypoints = checkpoints.map((cp) => `${cp.lat},${cp.lng}`).join("|");
  const waypointParam = waypoints.length > 0 ? `&waypoints=${encodeURIComponent(waypoints)}` : "";

  return `${baseUrl}&origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}&destination=${encodeURIComponent(
    `${destination.lat},${destination.lng}`
  )}${waypointParam}`;
}

function validateLatLng(lat: number, lng: number, label: string): void {
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new BadRequestException(`Invalid ${label} coordinates`);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function getEtaBaseTime(plannedDeparture: Date): Date {
  const now = new Date();
  return plannedDeparture.getTime() > now.getTime() ? plannedDeparture : now;
}

function mapFrontendTypeToCheckpointTypes(type?: string): CheckpointType[] {
  switch (type) {
    case "fuel":
      return [CheckpointType.FUEL];
    case "food":
      return [CheckpointType.RESTAURANT];
    case "rest":
      return [CheckpointType.REST_AREA];
    case "ev":
      return [CheckpointType.EV_CHARGING];
    case "origin":
    case "destination":
      return [CheckpointType.REST_AREA];
    default:
      return [CheckpointType.REST_AREA];
  }
}

function inferStopDuration(type?: string): number {
  switch (type) {
    case "fuel":
      return 10;
    case "ev":
      return 30;
    case "food":
      return 30;
    case "rest":
      return 15;
    default:
      return 15;
  }
}

function moveAfter(ids: string[], idToMove: string, afterId: string): string[] {
  const base = ids.filter((id) => id !== idToMove);
  const idx = base.indexOf(afterId);
  if (idx < 0) {
    return [...base, idToMove];
  }
  const out = [...base];
  out.splice(idx + 1, 0, idToMove);
  return out;
}

function buildVirtualVehicle(type: SupportedVehicleType): {
  name: string;
  id: string;
  type: VehicleType;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  brand: string;
  tankCapacity: number | null;
  batteryCapacity: number | null;
  realWorldRange: number;
  popularityRank: number;
} {
  const now = new Date();
  switch (type) {
    case "CNG":
      return {
        id: "VIRTUAL_CNG",
        name: "Generic CNG Car",
        type: VehicleType.PETROL,
        imageUrl: null,
        createdAt: now,
        updatedAt: now,
        brand: "Generic",
        realWorldRange: 300,
        tankCapacity: 12,
        batteryCapacity: null,
        popularityRank: 0
      };
    case VehicleType.PETROL:
      return {
        id: "VIRTUAL_PETROL",
        name: "Generic Petrol Car",
        type: VehicleType.PETROL,
        imageUrl: null,
        createdAt: now,
        updatedAt: now,
        brand: "Generic",
        realWorldRange: 550,
        tankCapacity: 45,
        batteryCapacity: null,
        popularityRank: 0
      };
    case VehicleType.DIESEL:
      return {
        id: "VIRTUAL_DIESEL",
        name: "Generic Diesel Car",
        type: VehicleType.DIESEL,
        imageUrl: null,
        createdAt: now,
        updatedAt: now,
        brand: "Generic",
        realWorldRange: 700,
        tankCapacity: 50,
        batteryCapacity: null,
        popularityRank: 0
      };
    case VehicleType.EV:
      return {
        id: "VIRTUAL_EV",
        name: "Generic EV",
        type: VehicleType.EV,
        imageUrl: null,
        createdAt: now,
        updatedAt: now,
        brand: "Generic",
        realWorldRange: 300,
        tankCapacity: null,
        batteryCapacity: 40,
        popularityRank: 0
      };
    case VehicleType.HYBRID:
      return {
        id: "VIRTUAL_HYBRID",
        name: "Generic Hybrid",
        type: VehicleType.HYBRID,
        imageUrl: null,
        createdAt: now,
        updatedAt: now,
        brand: "Generic",
        realWorldRange: 800,
        tankCapacity: 45,
        batteryCapacity: null,
        popularityRank: 0
      };
    default:
      return {
        id: "VIRTUAL_PETROL",
        name: "Generic Petrol Car",
        type: VehicleType.PETROL,
        imageUrl: null,
        createdAt: now,
        updatedAt: now,
        brand: "Generic",
        realWorldRange: 550,
        tankCapacity: 45,
        batteryCapacity: null,
        popularityRank: 0
      };
  }
}
