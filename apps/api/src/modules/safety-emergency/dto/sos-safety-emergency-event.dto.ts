import { Transform } from "class-transformer";
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { optionalNumber, optionalStringArray, trimOptional } from "./transformers";

export class SosSafetyEmergencyEventDto {
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  incident_type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  severity_level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  response_level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  title?: string;

  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  location!: string;

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

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  gps_lng?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  gps_lat?: number;

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
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  photos_file_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  videos_file_ids?: string[];
}
