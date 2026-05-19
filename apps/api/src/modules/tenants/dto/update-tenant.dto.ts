import { Transform } from "class-transformer";
import { IsArray, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenantName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  tenantType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactMobile?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  websites?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domains?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  planCode?: string | null;

  @IsOptional()
  @IsISO8601()
  expireTime?: string | null;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 0))
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 0))
  @IsInt()
  @Min(0)
  maxParks?: number;

  @IsOptional()
  @IsIn([0, 1, 2, "0", "1", "2", "enabled", "disabled", "expired"])
  status?: number | string;

  @IsOptional()
  @IsObject()
  featureConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}
