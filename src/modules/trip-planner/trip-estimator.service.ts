import { BadRequestException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { Checkpoint, Vehicle, VehicleType } from "@prisma/client";
import { GoogleMapsService } from "../../common/google-maps/google-maps.service";
import { formatDuration } from "../../common/utils/break-time-estimator";
import { CandidateAlongRoute, rankCheckpointsForTrip } from "../../common/utils/checkpoint-ranker";
import { findCheckpointsAlongRoute } from "../../common/utils/poi-along-route";
import { PrismaService } from "../../prisma/prisma.service";
import { FuelPriceService } from "../pricing/fuel-price.service";
import { TollCostService, type TollCostEstimate } from "../pricing/toll-cost.service";
// import { VehiclesService } from "../vehicles/vehicles.service";
import { EstimateTripDto } from "./dto/estimate-trip.dto";
import { RouteFinderService } from "./route-finder.service";

type SupportedVehicleType = VehicleType | "CNG";

export type TripEstimateResponse = {
  summary: {
    totalDistanceKm: number;
    driveTimeMinutes: number;
    driveTimeFormatted: string;
    estimatedArrival: string;
    encodedPolyline?: string;
    highway?: string;
    fuelCost: {
      amount: number;
      formatted: string;
      subtitle: string;
      breakdown: {
        litersNeeded: number;
        pricePerUnit: number;
        fuelType: SupportedVehicleType;
      };
    };
    tollCost: TollCostEstimate;
    breakTime: {
      totalMinutes: number;
      formatted: string;
      estimatedStops: number;
      subtitle: string;
    };
    primaryHighway: string;
  };
  warnings: string[];
};

@Injectable()
export class TripEstimatorService {
  constructor(
    private readonly routeFinder: RouteFinderService,
    // private readonly vehiclesService: VehiclesService,
    private readonly prisma: PrismaService,
    private readonly fuelPriceService: FuelPriceService,
    private readonly tollCostService: TollCostService,
    private readonly googleMaps: GoogleMapsService
  ) {}

  async estimate(input: EstimateTripDto): Promise<TripEstimateResponse> {
    const departure = new Date(input.departureTime);
    if (Number.isNaN(departure.getTime())) {
      throw new BadRequestException("Invalid departure time");
    }

    const origin = await this.resolveLocation(input.origin, "origin");
    const destination = await this.resolveLocation(input.destination, "destination");

    const route = await this.routeFinder.getRoute({
      origin: { lat: origin.lat, lng: origin.lng, address: origin.address },
      destination: { lat: destination.lat, lng: destination.lng, address: destination.address }
    });

    const totalDistanceKm = Math.round(route.distanceMeters / 1000);
    const driveTimeMinutes = Math.round(route.durationSeconds / 60);

    const minTripKm = Number(process.env.MIN_TRIP_DISTANCE_KM ?? 80);
    if (totalDistanceKm < minTripKm) {
      const googleMapsUrl = buildGoogleMapsUrl(
        { lat: origin.lat, lng: origin.lng },
        { lat: destination.lat, lng: destination.lng },
        []
      );
      throw new UnprocessableEntityException({
        error: "TRIP_TOO_SHORT",
        message: `This trip is just ${totalDistanceKm} km — short enough to drive straight through. Pitstop is built for longer journeys.`,
        totalDistanceKm,
        googleMapsUrl
      });
    }

    const resolvedVehicle = await this.resolveVehicle(input);
    const vehicle = resolvedVehicle.vehicle;
    const requestedFuelType = resolvedVehicle.requestedFuelType;

    const fuelCost = await this.calculateFuelCost({
      distanceKm: totalDistanceKm,
      vehicleType: requestedFuelType,
      realWorldRange: vehicle.realWorldRange,
      tankCapacity: vehicle.tankCapacity ?? null,
      batteryCapacity: vehicle.batteryCapacity ?? null
    });

    const tollCost = await this.tollCostService.estimate(route);

    const radiusMeters = Number(process.env.POI_FETCH_RADIUS_METERS ?? 5000);
    const alongRoute = await findCheckpointsAlongRoute({
      prisma: this.prisma,
      encodedPolyline: route.encodedPolyline,
      radiusMeters
    });

    const candidates: CandidateAlongRoute[] = alongRoute.map((item) => ({
      checkpoint: item.checkpoint as unknown as Checkpoint,
      distanceFromOriginKm: Math.round(item.fractionAlongRoute * totalDistanceKm * 100) / 100
    }));

    const ranked = rankCheckpointsForTrip({
      vehicle,
      candidatesAlongRoute: candidates,
      totalDistanceKm,
      fuelPercent: input.fuelPercent
    });

    const estimatedStops = ranked.length;
    const totalBreakMinutes = ranked.reduce(
      (sum, item) => sum + (item.checkpoint.suggestedStopDuration || 15),
      0
    );
    const breakTime = {
      totalMinutes: totalBreakMinutes,
      formatted: formatDuration(totalBreakMinutes),
      estimatedStops,
      subtitle: estimatedStops === 0 ? "No stops needed" : `${estimatedStops} planned ${estimatedStops === 1 ? "stop" : "stops"}`
    };

    const estimatedArrival = addMinutes(departure, driveTimeMinutes + breakTime.totalMinutes).toISOString();

    const highways = this.tollCostService.extractHighways(route);
    const primaryHighway = highways[0] ?? "UNKNOWN";

    const warnings = this.buildWarnings({
      totalDistanceKm,
      vehicleType: vehicle.type,
      realWorldRange: vehicle.realWorldRange,
      fuelPercent: input.fuelPercent
    });

    return {
      summary: {
        totalDistanceKm,
        driveTimeMinutes,
        driveTimeFormatted: formatDuration(driveTimeMinutes),
        estimatedArrival,
        encodedPolyline: route.encodedPolyline,
        highway: primaryHighway,
        fuelCost,
        tollCost,
        breakTime,
        primaryHighway
      },
      warnings
    };
  }

  private async calculateFuelCost(params: {
    distanceKm: number;
    vehicleType: SupportedVehicleType;
    realWorldRange: number;
    tankCapacity: number | null;
    batteryCapacity: number | null;
  }): Promise<TripEstimateResponse["summary"]["fuelCost"]> {
    const { pricePerUnit } = await this.fuelPriceService.getPrice({ fuelType: params.vehicleType });

    let unitsNeeded = 0;
    let subtitleUnit = "L";

    if (params.vehicleType === "CNG") {
      const cngCapacityKg = params.tankCapacity ?? 12;
      unitsNeeded = (params.distanceKm / params.realWorldRange) * cngCapacityKg;
      subtitleUnit = "kg";
    } else if (params.vehicleType === VehicleType.EV) {
      if (!params.batteryCapacity) {
        throw new BadRequestException("EV vehicle is missing batteryCapacity");
      }
      unitsNeeded = (params.distanceKm / params.realWorldRange) * params.batteryCapacity;
      subtitleUnit = "kWh";
    } else {
      if (!params.tankCapacity) {
        throw new BadRequestException("Vehicle is missing tankCapacity");
      }
      unitsNeeded = (params.distanceKm / params.realWorldRange) * params.tankCapacity;
      subtitleUnit = "L";
    }

    const amount = Math.round(unitsNeeded * pricePerUnit);

    return {
      amount,
      formatted: formatINR(amount),
      subtitle: `est. at ₹${pricePerUnit}/${subtitleUnit}`,
      breakdown: {
        litersNeeded: Number(unitsNeeded.toFixed(2)),
        pricePerUnit,
        fuelType: params.vehicleType
      }
    };
  }

  private async resolveVehicle(input: EstimateTripDto): Promise<{
    vehicle: Vehicle;
    requestedFuelType: SupportedVehicleType;
  }> {
    // if (input.vehicleId) {
    //   const vehicle = await this.vehiclesService.getVehicleById(input.vehicleId);
    //   if (!vehicle) throw new NotFoundException("Vehicle not found");
    //   return {
    //     id: vehicle.id,
    //     name: vehicle.name,
    //     type: vehicle.type,
    //     realWorldRange: vehicle.realWorldRange,
    //     tankCapacity: vehicle.tankCapacity ?? null,
    //     batteryCapacity: vehicle.batteryCapacity ?? null
    //   };
    // }

    if (!input.vehicleType) {
      input.vehicleType = "PETROL";
    }

    if (input.vehicleType === "CNG") {
      return {
        vehicle: buildVirtualVehicle("CNG"),
        requestedFuelType: "CNG"
      };
    }

    return {
      vehicle: buildVirtualVehicle(input.vehicleType),
      requestedFuelType: input.vehicleType
    };
  }

  private buildWarnings(params: {
    totalDistanceKm: number;
    vehicleType: VehicleType;
    realWorldRange: number;
    fuelPercent: number;
  }): string[] {
    const warnings: string[] = [];

    const bounded = Math.min(Math.max(params.fuelPercent, 0), 100);
    const currentRangeKm = (bounded / 100) * params.realWorldRange;
    const usableRangeKm = currentRangeKm * 0.85;
    const needsRefuel = usableRangeKm < params.totalDistanceKm;
    if (needsRefuel) {
      warnings.push(`Refuel needed around km ${Math.round(usableRangeKm)}`);
    }

    return warnings;
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

function validateLatLng(lat: number, lng: number, label: string): void {
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new BadRequestException(`Invalid ${label} coordinates`);
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + Math.round(minutes) * 60_000);
}

function formatINR(amount: number): string {
  return `₹ ${amount.toLocaleString("en-IN")}`;
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

