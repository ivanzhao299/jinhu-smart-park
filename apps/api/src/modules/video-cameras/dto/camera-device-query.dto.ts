import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { optionalBoolean, optionalInteger, trimOptional } from "./transformers";

export class CameraDeviceQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  camera_name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  camera_code?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  brand?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  platform_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  usage?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  camera_usage?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  status?: string;

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
  @IsBoolean()
  @Transform(({ value }) => optionalBoolean(value))
  is_enabled?: boolean;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  sort?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => optionalInteger(value))
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Transform(({ value }) => optionalInteger(value))
  page_size?: number;
}
