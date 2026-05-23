import { Transform } from "class-transformer";
import { IsDateString, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "./transformers";

export type IotMetricPayloadValue = string | number | boolean | Record<string, unknown> | null;

export class IotHttpIngestDto {
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  device_code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  gateway_code?: string;

  @IsOptional()
  @IsDateString()
  reported_at?: string;

  @IsObject()
  metrics!: Record<string, IotMetricPayloadValue>;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  quality?: string;

  @IsOptional()
  @IsObject()
  raw_payload?: Record<string, unknown>;
}
