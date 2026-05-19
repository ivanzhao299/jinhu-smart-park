import { IsArray, IsISO8601, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateTenantModulesDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  parkId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  planCode?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  moduleCodes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];

  @IsOptional()
  @IsISO8601()
  expireTime?: string | null;

  @IsOptional()
  @IsObject()
  featureConfig?: Record<string, unknown>;
}
