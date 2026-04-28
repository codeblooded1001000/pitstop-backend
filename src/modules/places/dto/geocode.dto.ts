import { IsOptional, IsString, MinLength } from "class-validator";

export class GeocodeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  address?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  placeId?: string;
}

