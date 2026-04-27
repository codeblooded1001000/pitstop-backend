import { Controller, Get } from "@nestjs/common";
import { Vehicle } from "@prisma/client";
import { VehiclesService } from "./vehicles.service";

@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  async getVehicles(): Promise<Vehicle[]> {
    return this.vehiclesService.listVehicles();
  }
}
