import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { optionalInteger, trimOptional } from "./transformers";

export class IotDeviceHistoryQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  metric_code?: string;

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

export class IotDeviceTrendQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  metric_code?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  start_time?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  end_time?: string;

  @IsOptional()
  @IsIn(["minute", "hour", "day"])
  @Transform(({ value }) => trimOptional(value))
  interval?: "minute" | "hour" | "day";
}
