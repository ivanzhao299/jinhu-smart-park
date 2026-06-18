import { Allow, IsOptional } from "class-validator";

export class RefreshTokenDto {
  @IsOptional()
  @Allow()
  refreshToken?: string;
}
