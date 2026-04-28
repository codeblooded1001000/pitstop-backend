import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { PlanTripV2Dto } from "./dto/plan-trip-v2.dto";
import { TripPlannerService, TripPlanResponseV2 } from "./trip-planner.service";
import { EstimateTripDto } from "./dto/estimate-trip.dto";
import { TripEstimatorService, TripEstimateResponse } from "./trip-estimator.service";

@Controller("trip")
export class TripPlannerController {
  constructor(
    private readonly tripPlannerService: TripPlannerService,
    private readonly tripEstimator: TripEstimatorService
  ) {}

  @Post("estimate")
  @HttpCode(200)
  async estimateTrip(@Body() dto: EstimateTripDto): Promise<TripEstimateResponse> {
    return this.tripEstimator.estimate(dto);
  }

  @Post("plan")
  async planTrip(@Body() dto: PlanTripV2Dto): Promise<ContractTripPlanResponse> {
    const trip = await this.tripPlannerService.planTripV2(dto);
    return toContractTripPlanResponse(trip);
  }

  @Get(":tripPlanId")
  async getTrip(@Param("tripPlanId") tripPlanId: string): Promise<ContractTripPlanResponse> {
    const trip = await this.tripPlannerService.getTripPlanById(tripPlanId);
    return toContractTripPlanResponse(trip);
  }

  @Post(":tripPlanId/add-checkpoint")
  async addCheckpoint(
    @Param("tripPlanId") tripPlanId: string,
    @Body()
    body: {
      checkpointId?: string;
      type?: "origin" | "fuel" | "food" | "rest" | "ev" | "destination";
      afterCheckpointId?: string;
      lat?: number;
      lng?: number;
      name?: string;
    }
  ): Promise<ContractTripPlanResponse> {
    const trip = await this.tripPlannerService.addCheckpointFlexible({
      tripPlanId,
      checkpointId: body.checkpointId,
      custom:
        typeof body.lat === "number" && typeof body.lng === "number" && typeof body.name === "string"
          ? { lat: body.lat, lng: body.lng, name: body.name, type: body.type }
          : undefined,
      afterCheckpointId: body.afterCheckpointId
    });
    return toContractTripPlanResponse(trip);
  }

  @Post(":tripPlanId/remove-checkpoint")
  async removeCheckpoint(
    @Param("tripPlanId") tripPlanId: string,
    @Body() body: { checkpointId: string }
  ): Promise<ContractTripPlanResponse> {
    const trip = await this.tripPlannerService.removeCheckpoint({ tripPlanId, checkpointId: body.checkpointId });
    return toContractTripPlanResponse(trip);
  }

  @Get(":tripPlanId/nearby-checkpoints")
  async nearby(@Param("tripPlanId") tripPlanId: string): Promise<{
    available: Array<{
      id: string;
      name: string;
      fullAddress: string;
      type: string;
      lat: number;
      lng: number;
      note?: string;
      duration: number;
      distanceFromOriginKm: number;
      distanceFromRouteMeters: number;
    }>;
  }> {
    const result = await this.tripPlannerService.nearbyCheckpoints(tripPlanId);
    return {
      available: result.available.map((cp) => ({
        id: cp.id,
        name: cp.name,
        fullAddress: cp.fullAddress,
        type: mapTypesToFrontendType(cp.types),
        lat: cp.lat,
        lng: cp.lng,
        note: cp.rating ? `Rated ${cp.rating}` : undefined,
        duration: cp.duration,
        distanceFromOriginKm: cp.distanceFromOriginKm,
        distanceFromRouteMeters: cp.distanceFromRouteMeters
      }))
    };
  }
}

type ContractTripPlanResponse = {
  id: string;
  trip: {
    origin: { name: string; lat: number; lng: number };
    destination: { name: string; lat: number; lng: number };
    totalDistanceKm: number;
    totalDuration: string;
    encodedPolyline: string;
    googleMapsUrl: string;
  };
  checkpoints: Array<{
    id: string;
    name: string;
    type: "origin" | "fuel" | "food" | "rest" | "ev" | "destination";
    lat: number;
    lng: number;
    distanceFromOriginKm: number;
    eta: string;
    duration: number;
    note?: string;
    reasoning?: string;
  }>;
};

function toContractTripPlanResponse(src: TripPlanResponseV2): ContractTripPlanResponse {
  return {
    id: src.tripPlanId,
    trip: {
      origin: { name: src.trip.originAddress, lat: src.trip.originLat, lng: src.trip.originLng },
      destination: {
        name: src.trip.destinationAddress,
        lat: src.trip.destinationLat,
        lng: src.trip.destinationLng
      },
      totalDistanceKm: src.trip.totalDistanceKm,
      totalDuration: formatDuration(src.trip.totalDurationMinutes),
      encodedPolyline: src.trip.encodedPolyline,
      googleMapsUrl: src.trip.googleMapsUrl
    },
    checkpoints: src.checkpoints.map((cp) => ({
      id: cp.id,
      name: cp.name,
      type: mapTypesToFrontendType(cp.types) as "origin" | "fuel" | "food" | "rest" | "ev" | "destination",
      lat: cp.lat,
      lng: cp.lng,
      distanceFromOriginKm: cp.distanceFromOriginKm,
      eta: new Date(cp.arrivalTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      duration: cp.stopDurationMinutes,
      note: cp.rating ? `Rating ${cp.rating}` : undefined,
      reasoning: cp.reasoning
    }))
  };
}

function mapTypesToFrontendType(types: string[]): string {
  if (types.includes("EV_CHARGING")) return "ev";
  if (types.includes("FUEL")) return "fuel";
  if (types.includes("DHABA") || types.includes("RESTAURANT") || types.includes("CAFE")) return "food";
  if (types.includes("REST_AREA")) return "rest";
  return "rest";
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
