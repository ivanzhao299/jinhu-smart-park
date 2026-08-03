import { Transform } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength
} from "class-validator";

function normalizeReadableBusinessName(value: unknown): unknown {
  return typeof value === "string"
    ? value.replace(/\p{Default_Ignorable_Code_Point}/gu, "").normalize("NFC").trim()
    : value;
}

export class CreateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parkId?: string;

  @IsString()
  @MaxLength(64)
  tenantCode!: string;

  @IsString()
  @MaxLength(100)
  tenantName!: string;

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
  @IsArray()
  @IsString({ each: true })
  moduleCodes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionCodes?: string[];

  @IsOptional()
  @IsObject()
  featureConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parkCode?: string;

  @Transform(({ value }) => normalizeReadableBusinessName(value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\p{L}/u, { message: "parkName must contain a readable letter" })
  parkName!: string;

  @IsString()
  @MaxLength(64)
  adminUsername!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  adminPassword!: string;

  @IsString()
  @MaxLength(100)
  adminDisplayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  adminMobile?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  adminEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}
