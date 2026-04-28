import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CheckpointsModule } from "./checkpoints/checkpoints.module";
import { TripPlannerModule } from "./trip-planner/trip-planner.module";
import { VehiclesModule } from "./vehicles/vehicles.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../common/redis/redis.module";
import { GoogleMapsModule } from "../common/google-maps/google-maps.module";
import { PlacesModule } from "./places/places.module";
import { PoiFetcherModule } from "../jobs/poi-fetcher/poi-fetcher.module";
import { AdminModule } from "./admin/admin.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { PricingModule } from "./pricing/pricing.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    GoogleMapsModule,
    PoiFetcherModule,
    VehiclesModule,
    CheckpointsModule,
    PlacesModule,
    AdminModule,
    FeedbackModule,
    PricingModule,
    TripPlannerModule
  ]
})
export class AppModule {}
