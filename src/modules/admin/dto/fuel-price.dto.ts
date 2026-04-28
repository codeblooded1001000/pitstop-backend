import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class SetFuelPriceDto {
  @IsString()
  @IsIn(["PETROL", "DIESEL", "EV", "HYBRID"])
  fuelType!: "PETROL" | "DIESEL" | "EV" | "HYBRID";

  @IsOptional()
  @IsString()
  region?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerUnit!: number;

  @IsOptional()
  @IsString()
  @IsIn(["LITER", "KG", "KWH"])
  unit?: "LITER" | "KG" | "KWH";

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

