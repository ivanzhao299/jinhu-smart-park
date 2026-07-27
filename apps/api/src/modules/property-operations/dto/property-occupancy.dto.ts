import { Transform } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf
} from "class-validator";
import {
  PROPERTY_OCCUPANCY_DOMAINS,
  type PropertyOccupancyDomain
} from "@jinhu/shared";

const trim = ({ value }: { value: unknown }): string => String(value ?? "").trim();
const optionalTrim = ({ value }: { value: unknown }): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
};

export class CreatePropertyOccupancyDto {
  @IsUUID()
  unit_id!: string;

  @IsIn(PROPERTY_OCCUPANCY_DOMAINS)
  source_domain!: PropertyOccupancyDomain;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  source_type!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  source_id!: string;

  @IsDateString()
  start_at!: string;

  @IsDateString()
  end_at!: string;

  @IsIn(["held", "active"])
  status!: "held" | "active";

  @ValidateIf((dto: CreatePropertyOccupancyDto) => dto.status === "held")
  @IsDateString()
  hold_expires_at?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class CheckPropertyAvailabilityDto {
  @IsUUID()
  unit_id!: string;

  @IsDateString()
  start_at!: string;

  @IsDateString()
  end_at!: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(64)
  exclude_source_type?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(64)
  exclude_source_id?: string;
}

export class PropertyOccupancyQueryDto {
  @IsOptional()
  @IsUUID()
  unit_id?: string;

  @IsOptional()
  @IsIn(PROPERTY_OCCUPANCY_DOMAINS)
  source_domain?: PropertyOccupancyDomain;

  @IsOptional()
  @IsIn(["held", "active", "released", "completed", "cancelled"])
  status?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
}

export class ReleasePropertyOccupancyDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  force?: boolean;
}
