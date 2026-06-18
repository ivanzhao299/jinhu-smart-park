import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  refreshToken?: string;
}
