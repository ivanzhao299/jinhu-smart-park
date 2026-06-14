import { IsArray, IsISO8601, IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateTenantLoginSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultParkId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  planCode?: string | null;

  @IsOptional()
  @IsISO8601()
  expireTime?: string | null;

  @IsOptional()
  @IsIn([0, 1, 2, "0", "1", "2", "enabled", "disabled", "expired"])
  status?: number | string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  moduleCodes?: string[];

  @IsOptional()
  @IsObject()
  featureConfig?: Record<string, unknown>;
}
