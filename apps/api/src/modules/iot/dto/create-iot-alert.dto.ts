import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { trimOptional } from "./transformers";

export class CreateIotAlertDto {
  @IsUUID()
  device_id!: string;

  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  alert_type!: string;

  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value))
  alert_level!: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => trimOptional(value))
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  source_type?: string;

  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
