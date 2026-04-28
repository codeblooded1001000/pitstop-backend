import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CheckpointFeedbackDto {
  @IsString()
  @MinLength(5)
  checkpointId!: string;

  @IsString()
  @IsIn(["CLOSED", "WRONG_LOCATION", "DIRTY", "OTHER"])
  reason!: "CLOSED" | "WRONG_LOCATION" | "DIRTY" | "OTHER";

  @IsOptional()
  @IsString()
  @MinLength(2)
  comment?: string;
}

