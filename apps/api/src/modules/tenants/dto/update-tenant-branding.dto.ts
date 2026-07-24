import { IsString, MaxLength, MinLength } from "class-validator";

export class UpdateTenantBrandingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  systemName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(24)
  shortName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  logoAlt!: string;
}
