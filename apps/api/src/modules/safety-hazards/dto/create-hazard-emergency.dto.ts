import { Transform } from "class-transformer";
import { IsString, MaxLength } from "class-validator";

function trimRequired(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export class CreateHazardEmergencyDto {
  @Transform(({ value }) => trimRequired(value))
  @IsString()
  @MaxLength(64)
  incident_type!: string;

  @Transform(({ value }) => trimRequired(value))
  @IsString()
  @MaxLength(32)
  severity_level!: string;

  @Transform(({ value }) => trimRequired(value))
  @IsString()
  @MaxLength(200)
  title!: string;

  @Transform(({ value }) => trimRequired(value))
  @IsString()
  @MaxLength(2000)
  description!: string;

  @Transform(({ value }) => trimRequired(value))
  @IsString()
  @MaxLength(500)
  reason!: string;
}
