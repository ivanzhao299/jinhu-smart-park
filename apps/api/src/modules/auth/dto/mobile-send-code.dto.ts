import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class MobileSendCodeDto {
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parkId?: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  mobile!: string;

  @IsOptional()
  @IsIn(["login", "bind"])
  scene?: string;
}
