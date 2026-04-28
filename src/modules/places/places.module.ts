import { Module } from "@nestjs/common";
import { PlacesController } from "./places.controller";
import { ReverseGeocodeService } from "./reverse-geocode.service";

@Module({
  controllers: [PlacesController],
  providers: [ReverseGeocodeService]
})
export class PlacesModule {}

