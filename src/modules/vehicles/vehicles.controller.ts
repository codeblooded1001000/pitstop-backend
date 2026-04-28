import { Controller, Get } from "@nestjs/common";
import { VehiclesService } from "./vehicles.service";

@Controller("vehicles")
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  async getVehicles(): Promise<
    Array<{
      id: string;
      name: string;
      type: "PETROL" | "DIESEL" | "EV" | "HYBRID" | "CNG";
      realWorldRange: number;
      thumbnailUrl: string | null;
    }>
  > {
    const vehicles = await this.vehiclesService.listVehicles();
    return vehicles.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      realWorldRange: v.realWorldRange,
      thumbnailUrl: v.imageUrl ?? null
    }));
  }
}
