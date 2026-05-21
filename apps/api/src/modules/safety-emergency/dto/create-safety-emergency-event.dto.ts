import { Transform } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { optionalNumber, optionalStringArray, trimOptional } from "./transformers";

export class CreateSafetyEmergencyEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  emergency_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  source_type?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  source_id?: string;

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  incident_type!: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  severity_level!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  response_level?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  title!: string;

  @IsString()
  @Transform(({ value }) => trimOptional(value))
  description!: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  building_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  floor_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  unit_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  park_tenant_id?: string;

  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  location!: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  gps_lng?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  gps_lat?: number;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  reporter_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimOptional(value))
  reporter_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  reporter_mobile?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  commander_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimOptional(value))
  commander_name?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  response_team_user_ids?: string[];

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  emergency_plan_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  photos_file_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  videos_file_ids?: string[];

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  review_file_id?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  conclusion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
