import { Transform } from "class-transformer";
import { IsDateString, IsOptional, IsString, IsUUID } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export class SafetyStatisticsQueryDto {
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  start_date?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  end_date?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  building_id?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  risk_level?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  hazard_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  incident_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  permit_type?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  unit_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  park_tenant_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  handler_id?: string;
}
