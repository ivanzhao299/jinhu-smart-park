import { IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from "class-validator";

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

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  logoFileId?: string | null;
}
