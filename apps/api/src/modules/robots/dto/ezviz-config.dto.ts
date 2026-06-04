import { IsOptional, IsString, MaxLength } from "class-validator";

export class EzvizConfigDto {
  @IsString()
  @MaxLength(120)
  config_name!: string;

  @IsString()
  @MaxLength(120)
  app_key!: string;

  @IsString()
  @MaxLength(300)
  app_secret!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  api_base_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  callback_token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  access_token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  token_expire_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
