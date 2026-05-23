import { Transform } from "class-transformer";
import { IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { optionalInteger, optionalStringArray, trimOptional } from "../../safety-emergency/dto/transformers";

export class CreateSafetyWorkPermitDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  permit_code?: string;

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  permit_type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  apply_type?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  apply_user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimOptional(value))
  apply_user_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  apply_mobile?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  apply_park_tenant_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  contractor_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimOptional(value))
  contractor_contact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  contractor_mobile?: string;

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

  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  location!: string;

  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  time_start!: string;

  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  time_end!: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  risk_level!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  protective_measures?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  monitor_user_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimOptional(value))
  monitor_user_name?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  start_check_photo_file_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @Transform(({ value }) => optionalStringArray(value))
  end_check_photo_file_ids?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => optionalInteger(value))
  process_check_count?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => optionalInteger(value))
  violation_count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
