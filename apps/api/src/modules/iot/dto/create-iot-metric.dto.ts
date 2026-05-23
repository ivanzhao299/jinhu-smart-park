import { Transform } from "class-transformer";
import { IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { optionalInteger, trimOptional } from "./transformers";

export class CreateIotMetricDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  metric_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  code?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  metric_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  device_type?: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  value_type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  unit?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  precision_digits?: number;

  @IsOptional()
  @IsObject()
  enum_map?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
