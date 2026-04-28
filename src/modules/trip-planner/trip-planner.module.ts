import { Module } from "@nestjs/common";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { TripPlannerController } from "./trip-planner.controller";
import { TripPlannerService } from "./trip-planner.service";
import { RouteFinderService } from "./route-finder.service";
import { TripEstimatorService } from "./trip-estimator.service";
import { PricingModule } from "../pricing/pricing.module";

@Module({
  imports: [VehiclesModule, PricingModule],
  providers: [TripPlannerService, TripEstimatorService, RouteFinderService],
  controllers: [TripPlannerController]
})
export class TripPlannerModule {}
