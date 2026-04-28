import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";

class LocationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class EstimateTripDto {
  @ValidateNested()
  @Type(() => LocationDto)
  origin!: LocationDto;

  @ValidateNested()
  @Type(() => LocationDto)
  destination!: LocationDto;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @IsIn(["PETROL", "DIESEL", "EV", "HYBRID", "CNG"])
  vehicleType?: "PETROL" | "DIESEL" | "EV" | "HYBRID" | "CNG";

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  fuelPercent!: number;

  @IsDateString()
  departureTime!: string;
}

