import { Injectable } from "@nestjs/common";
import { Prisma, Vehicle } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async listVehicles(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.VehicleWhereInput;
    orderBy?: Prisma.VehicleOrderByWithRelationInput;
  }): Promise<Vehicle[]> {
    const { skip, take, where, orderBy } = params ?? {};
    return this.prisma.vehicle.findMany({
      skip,
      take,
      where,
      orderBy: orderBy ?? { popularityRank: "asc" }
    });
  }

  async getVehicleById(id: string): Promise<Vehicle | null> {
    return this.prisma.vehicle.findUnique({ where: { id } });
  }
}
