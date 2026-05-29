import { Transform } from "class-transformer";
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { optionalInteger, optionalNumber, trimOptional } from "./transformers";

export class IotDeviceHeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  heartbeat_time?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => optionalInteger(value))
  latency_ms?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  signal_strength?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  battery_level?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Transform(({ value }) => trimOptional(value))
  firmware_version?: string;

  @IsOptional()
  @IsObject()
  raw_payload?: Record<string, unknown>;
}

export class IotDeviceMetricsDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  reported_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  quality?: string;

  @IsObject()
  metrics!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  raw_payload?: Record<string, unknown>;
}

export class IotRuntimeHistoryQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  start_time?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  end_time?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => optionalInteger(value))
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) => optionalInteger(value))
  page_size?: number;
}

export class IotRuntimeMetricsQueryDto extends IotRuntimeHistoryQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  metric_key?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  metric_code?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  metric_type?: string;
}
