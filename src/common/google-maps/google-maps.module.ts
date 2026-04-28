import { Global, Module } from "@nestjs/common";
import { GoogleMapsService } from "./google-maps.service";

@Global()
@Module({
  providers: [GoogleMapsService],
  exports: [GoogleMapsService]
})
export class GoogleMapsModule {}

