import { Transform } from "class-transformer";
import { IsBoolean, IsDateString, IsEmail, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

export class UpdateLeasingLeadDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
  @MaxLength(64)
  leadCode?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  contactName?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  contactMobile?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsEmail()
  @MaxLength(120)
  contactEmail?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  source?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  channelName?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  industryCode?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  industryDetail?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  demandArea?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  demandPrice?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  demandUnitType?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  intentionLevel?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsUUID()
  followUserId?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  followUserName?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsUUID()
  parkTenantId?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  lostReason?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  lostRemark?: string;

  @IsOptional()
  @IsDateString()
  lastFollowTime?: string;

  @IsOptional()
  @IsDateString()
  nextFollowTime?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @Transform(({ value }) => optionalBoolean(value))
  @IsBoolean()
  isInPool?: boolean;

  @IsOptional()
  @IsDateString()
  poolEnterTime?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
