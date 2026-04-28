import { IsString, MinLength } from "class-validator";

export class AutocompleteDto {
  @IsString()
  @MinLength(1)
  input!: string;

  @IsString()
  @MinLength(8)
  sessionToken!: string;
}

