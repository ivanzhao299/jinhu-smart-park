import { Transform } from "class-transformer";
import { IsDateString, IsNumber, IsObject, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { optionalNumber, trimOptional } from "./transformers";

export class CreateIotDeviceDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  device_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  code?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  device_name!: string;

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  device_type!: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  gateway_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => trimOptional(value))
  vendor_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => trimOptional(value))
  vendor_device_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  protocol_type?: string;

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
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => trimOptional(value))
  location?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  gps_lng?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  gps_lat?: number;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  install_date?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  warranty_end_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  online_status?: string;

  @IsOptional()
  @IsObject()
  status_payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
