import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { optionalNumber, trimOptional } from "./transformers";

export class CreateIotPointDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  point_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  code?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  metric_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  metric_code?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  point_name!: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  point_type!: string;

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
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trimOptional(value))
  report_topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => trimOptional(value))
  report_key?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  min_value?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  max_value?: number;

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
