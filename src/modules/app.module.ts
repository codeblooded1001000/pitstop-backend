import { Module } from "@nestjs/common";
import { CheckpointsModule } from "./checkpoints/checkpoints.module";
import { TripPlannerModule } from "./trip-planner/trip-planner.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule, VehiclesModule, CheckpointsModule, TripPlannerModule]
})
export class AppModule {}
