import { Module } from "@nestjs/common";
import { CheckpointsModule } from "../checkpoints/checkpoints.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { TripPlannerController } from "./trip-planner.controller";
import { TripPlannerService } from "./trip-planner.service";

@Module({
  imports: [VehiclesModule, CheckpointsModule],
  providers: [TripPlannerService],
  controllers: [TripPlannerController]
})
export class TripPlannerModule {}
