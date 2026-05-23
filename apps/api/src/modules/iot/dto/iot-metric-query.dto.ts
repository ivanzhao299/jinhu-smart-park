import { Transform } from "class-transformer";
import { IsOptional, IsString, Max, Min } from "class-validator";
import { optionalInteger, trimOptional } from "./transformers";

export class IotMetricQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  device_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  value_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @Min(1)
  @Max(200)
  page_size?: number = 20;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  sort?: string;
}
