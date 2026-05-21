import { Transform } from "class-transformer";
import { IsString, MaxLength } from "class-validator";

function trimRequired(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export class ReasonSafetyHazardActionDto {
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimRequired(value))
  reason!: string;
}
