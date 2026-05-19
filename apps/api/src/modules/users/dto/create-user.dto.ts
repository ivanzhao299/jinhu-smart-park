import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateUserDto {
  @IsString()
  @MaxLength(64)
  username!: string;

  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  mobile?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(128)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  gender?: string;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
