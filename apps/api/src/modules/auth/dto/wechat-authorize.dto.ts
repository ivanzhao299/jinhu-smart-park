import { IsOptional, IsString, MaxLength } from "class-validator";

export class WechatAuthorizeDto {
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parkId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  redirectUri?: string;
}
