import { IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @IsString()
  @MaxLength(64)
  parkId!: string;

  @IsString()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
