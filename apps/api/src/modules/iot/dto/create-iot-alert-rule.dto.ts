import { Transform } from "class-transformer";
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { optionalInteger, optionalNumber, trimOptional } from "./transformers";

export class CreateIotAlertRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  rule_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  code?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  rule_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  device_type?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  device_id?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  point_id?: string;

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  metric_code!: string;

  @IsString()
  @MaxLength(16)
  @Transform(({ value }) => trimOptional(value))
  operator!: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => optionalNumber(value))
  threshold_value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  threshold_text?: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  alert_level!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => trimOptional(value))
  alert_title_template?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  alert_content_template?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400)
  @Transform(({ value }) => optionalInteger(value))
  duration_seconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400)
  @Transform(({ value }) => optionalInteger(value))
  cooldown_seconds?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === undefined || value === null || value === "" ? undefined : value === true || value === "true" || value === 1 || value === "1")
  enabled?: boolean;

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
