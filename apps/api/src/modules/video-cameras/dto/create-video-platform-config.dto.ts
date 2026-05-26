import { Transform } from "class-transformer";
import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "./transformers";

export class CreateVideoPlatformConfigDto {
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  platform_type!: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  platform_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Transform(({ value }) => trimOptional(value))
  vendor_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Transform(({ value }) => trimOptional(value))
  app_key?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  app_secret?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  app_secret_encrypted?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  access_token?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  access_token_encrypted?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  refresh_token?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  refresh_token_encrypted?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => trimOptional(value))
  token_expire_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  api_base_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  callback_url?: string;

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
