import { IsString, IsUUID, MinLength } from "class-validator";

export class LoginDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  parkId!: string;

  @IsString()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
