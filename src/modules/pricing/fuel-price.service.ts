import { Injectable } from "@nestjs/common";
import { VehicleType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type SupportedFuelType = VehicleType | "CNG";

@Injectable()
export class FuelPriceService {
  // Fallback constants (update manually as prices change)
  private readonly DEFAULT_PRICES: Record<SupportedFuelType, number> = {
    PETROL: 95,
    DIESEL: 88,
    EV: 8,
    HYBRID: 95,
    CNG: 78
  };

  constructor(private readonly prisma: PrismaService) {}

  async getPrice(params: { fuelType: SupportedFuelType; region?: string }): Promise<{ pricePerUnit: number; unit: string }> {
    const region = params.region ?? "INDIA_AVG";
    const now = new Date();

    let override: { pricePerUnit: number; unit: string } | null = null;
    if (params.fuelType !== "CNG") {
      try {
        override = await this.prisma.fuelPriceOverride.findFirst({
          where: {
            fuelType: params.fuelType,
            region,
            expiresAt: { gt: now }
          },
          orderBy: { createdAt: "desc" },
          select: {
            pricePerUnit: true,
            unit: true
          }
        });
      } catch (error: unknown) {
        // Backward compatibility: if migration is not applied yet, fallback defaults keep API alive.
        const code = (error as { code?: string }).code;
        if (code !== "P2021") {
          throw error;
        }
      }
    }

    if (override) {
      return { pricePerUnit: override.pricePerUnit, unit: override.unit };
    }

    const fallback = this.DEFAULT_PRICES[params.fuelType];
    return { pricePerUnit: fallback, unit: defaultUnitForFuelType(params.fuelType) };
  }
}

function defaultUnitForFuelType(type: SupportedFuelType): string {
  if (type === "CNG") return "KG";
  if (type === VehicleType.EV) return "KWH";
  return "LITER";
}

