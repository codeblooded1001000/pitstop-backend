import { BadRequestException, Body, Controller, Post, Query } from "@nestjs/common";
import { VehicleType } from "@prisma/client";
import { PoiFetcherService } from "../../jobs/poi-fetcher/poi-fetcher.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SetFuelPriceDto } from "./dto/fuel-price.dto";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly poiFetcher: PoiFetcherService,
    private readonly prisma: PrismaService
  ) {}

  @Post("fetch-pois")
  async fetchPois(
    @Query("polyline") polyline: string | undefined,
    @Body() body: { encodedPolyline?: string } | undefined
  ): Promise<{ queued: true; jobId: string }> {
    const encodedPolyline = body?.encodedPolyline ?? polyline;
    if (!encodedPolyline) {
      throw new BadRequestException("encodedPolyline is required (body.encodedPolyline or ?polyline=)");
    }
    const { jobId } = await this.poiFetcher.enqueue(encodedPolyline);
    return { queued: true, jobId };
  }

  @Post("fuel-price")
  async setFuelPrice(@Body() dto: SetFuelPriceDto): Promise<{ ok: true }> {
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException("Invalid expiresAt");
    }

    await this.prisma.fuelPriceOverride.create({
      data: {
        fuelType: dto.fuelType as VehicleType,
        region: dto.region ?? "INDIA_AVG",
        pricePerUnit: dto.pricePerUnit,
        unit: dto.unit ?? (dto.fuelType === "EV" ? "KWH" : "LITER"),
        source: dto.source ?? null,
        expiresAt
      }
    });

    return { ok: true };
  }
}

