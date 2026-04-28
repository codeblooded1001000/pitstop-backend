import { Module } from "@nestjs/common";
import { FuelPriceService } from "./fuel-price.service";
import { TollCostService } from "./toll-cost.service";

@Module({
  providers: [FuelPriceService, TollCostService],
  exports: [FuelPriceService, TollCostService]
})
export class PricingModule {}

