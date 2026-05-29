import { Transform } from "class-transformer";
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { optionalNumber, trimOptional } from "./transformers";

export class CreateEnergyMeterDto {
  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @IsUUID()
  room_id?: string;

  @IsOptional()
  @IsUUID()
  area_id?: string;

  @IsOptional()
  @IsUUID()
  iot_device_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  meter_code?: string;

  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => trimOptional(value))
  meter_name!: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  meter_type!: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  meter_purpose!: string;

  @IsOptional()
  @IsUUID()
  related_park_tenant_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => optionalNumber(value))
  multiplier?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => optionalNumber(value))
  initial_reading?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @IsOptional()
  @IsDateString()
  last_reading_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
