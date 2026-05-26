import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { optionalBoolean, optionalInteger, optionalNumber, trimOptional } from "./transformers";

export class CreateCameraDeviceDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  camera_code?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  camera_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  camera_type?: string;

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  camera_usage!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => trimOptional(value))
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => trimOptional(value))
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => trimOptional(value))
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  platform_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => trimOptional(value))
  platform_device_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  ip_address?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => optionalInteger(value))
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => trimOptional(value))
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trimOptional(value))
  password_encrypted?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  rtsp_url?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  hls_url?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  webrtc_url?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  snapshot_url?: string;

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
  room_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  unit_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  area_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => trimOptional(value))
  install_location?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  longitude?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  latitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  direction?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => optionalBoolean(value))
  is_recording?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => optionalBoolean(value))
  is_enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
