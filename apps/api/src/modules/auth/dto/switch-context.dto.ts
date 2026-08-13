import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SwitchContextDto {
  @IsString()
  @MaxLength(64)
  parkId!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(256)
  @IsOptional()
  refreshToken?: string;
}
