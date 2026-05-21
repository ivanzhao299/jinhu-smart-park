import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class MobileLoginDto {
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

  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code!: string;
}
