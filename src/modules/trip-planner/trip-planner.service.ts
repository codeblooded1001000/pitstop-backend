import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Checkpoint, Vehicle } from "@prisma/client";
import { rankCheckpointsForTrip } from "../../common/utils/checkpoint-ranker";
import { calculateTripEta } from "../../common/utils/eta-calculator";
import { calculateRangeSummary } from "../../common/utils/range-calculator";
import { CheckpointsService } from "../checkpoints/checkpoints.service";
import { VehiclesService } from "../vehicles/vehicles.service";
import { PlanTripDto } from "./dto/plan-trip.dto";

const CORRIDOR_CONFIG = {
  DELHI_JAIPUR: {
    origin: "Delhi",
    destination: "Jaipur",
    totalDistanceKm: 270,
    totalDurationMinutes: 330
  }
} as const;

export type PlanTripResponse = {
  trip: {
    origin: string;
    destination: string;
    totalDistance: number;
    totalDuration: number;
    departureTime: string;
    estimatedArrival: string;
  };
  vehicle: {
    name: string;
    currentRangeKm: number;
    needsRefuel: boolean;
  };
  checkpoints: Array<{
    id: string;
    name: string;
    distanceFromOrigin: number;
    distanceFromPrevious: number;
    etaFromStart: number;
    arrivalTime: string;
    types: string[];
    reasoning: string;
    priority: "REQUIRED" | "RECOMMENDED" | "OPTIONAL";
    lat: number;
    lng: number;
  }>;
  googleMapsUrl: string;
};

@Injectable()
export class TripPlannerService {
  constructor(
    private readonly vehiclesService: VehiclesService,
    private readonly checkpointsService: CheckpointsService
  ) {}

  async planTrip(dto: PlanTripDto): Promise<PlanTripResponse> {
    const corridorConfig = CORRIDOR_CONFIG[dto.corridor];
    if (!corridorConfig) {
      throw new BadRequestException("Unsupported corridor");
    }

    const departureDate = new Date(dto.departureTime);
    if (Number.isNaN(departureDate.getTime())) {
      throw new BadRequestException("Invalid departure time");
    }

    const vehicle = await this.vehiclesService.getVehicleById(dto.vehicleId);
    if (!vehicle) {
      throw new NotFoundException("Vehicle not found");
    }

    const checkpoints = await this.checkpointsService.listByCorridor(dto.corridor);
    return buildPlan({
      vehicle,
      checkpoints,
      fuelPercent: dto.fuelPercent,
      departureTime: dto.departureTime,
      corridor: corridorConfig
    });
  }
}

function buildPlan(params: {
  vehicle: Vehicle;
  checkpoints: Checkpoint[];
  fuelPercent: number;
  departureTime: string;
  corridor: (typeof CORRIDOR_CONFIG)["DELHI_JAIPUR"];
}): PlanTripResponse {
  const { vehicle, checkpoints, fuelPercent, departureTime, corridor } = params;

  const range = calculateRangeSummary(vehicle, fuelPercent, corridor.totalDistanceKm);
  const ranked = rankCheckpointsForTrip({
    vehicle,
    range,
    checkpoints,
    totalDistanceKm: corridor.totalDistanceKm
  });

  const eta = calculateTripEta(
    departureTime,
    corridor.totalDistanceKm,
    ranked.map((item) => ({ distanceFromOrigin: item.checkpoint.distanceFromDelhi }))
  );

  const responseCheckpoints = ranked.map((item, index) => {
    const checkpointEta = eta.checkpointEtas[index];
    return {
      id: item.checkpoint.id,
      name: item.checkpoint.name,
      distanceFromOrigin: item.checkpoint.distanceFromDelhi,
      distanceFromPrevious: checkpointEta.distanceFromPrevious,
      etaFromStart: checkpointEta.etaFromStartMinutes,
      arrivalTime: checkpointEta.arrivalTimeIso,
      types: item.checkpoint.type,
      reasoning: item.reasoning,
      priority: item.priority,
      lat: item.checkpoint.latitude,
      lng: item.checkpoint.longitude
    };
  });

  return {
    trip: {
      origin: corridor.origin,
      destination: corridor.destination,
      totalDistance: corridor.totalDistanceKm,
      totalDuration: eta.totalDurationMinutes || corridor.totalDurationMinutes,
      departureTime,
      estimatedArrival: eta.estimatedArrivalIso
    },
    vehicle: {
      name: vehicle.name,
      currentRangeKm: range.currentRangeKm,
      needsRefuel: range.needsRefuel
    },
    checkpoints: responseCheckpoints,
    googleMapsUrl: buildGoogleMapsUrl(corridor.origin, corridor.destination, responseCheckpoints)
  };
}

function buildGoogleMapsUrl(
  origin: string,
  destination: string,
  checkpoints: Array<{ lat: number; lng: number }>
): string {
  const baseUrl = "https://www.google.com/maps/dir/?api=1";
  const waypoints = checkpoints.map((cp) => `${cp.lat},${cp.lng}`).join("|");
  const waypointParam = waypoints.length > 0 ? `&waypoints=${encodeURIComponent(waypoints)}` : "";

  return `${baseUrl}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
    destination
  )}${waypointParam}`;
}
