import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsString, Max, Min } from "class-validator";

export class PlanTripDto {
  @IsString()
  vehicleId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  fuelPercent!: number;

  @IsDateString()
  departureTime!: string;

  @IsString()
  @IsIn(["DELHI_JAIPUR"])
  corridor!: "DELHI_JAIPUR";
}
