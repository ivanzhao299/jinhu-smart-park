import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parkId?: string;

  @IsString()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
