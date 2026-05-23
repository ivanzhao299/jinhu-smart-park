import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { optionalInteger, trimOptional } from "./transformers";

export class IotAlertQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  device_id?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  metric_code?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  alert_level?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  start_date?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  end_date?: string;

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
  @Max(200)
  @Transform(({ value }) => optionalInteger(value))
  page_size?: number;
}
