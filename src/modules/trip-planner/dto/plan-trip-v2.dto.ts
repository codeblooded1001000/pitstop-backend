import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested
} from "class-validator";

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
  @MinLength(2)
  address?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

class PreferencesDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(3)
  @Max(6)
  maxCheckpoints?: number;

  @IsOptional()
  @IsArray()
  @IsIn(["FOOD", "FUEL", "EV"], { each: true })
  prioritize?: Array<"FOOD" | "FUEL" | "EV">;
}

export class PlanTripV2Dto {
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

  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;
}

