import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf } from "class-validator";
import { PROPERTY_OPERATING_STATUSES, type PropertyOperatingStatus } from "@jinhu/shared";

const trimOptional = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
};

const trimNullableOptional = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return String(value).trim() || null;
};

export class ConfigurePropertyUnitDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsUUID()
  asset_unit_id?: string | null;

  @IsIn(PROPERTY_OPERATING_STATUSES)
  operating_status!: PropertyOperatingStatus;

  @ValidateIf((dto: ConfigurePropertyUnitDto) => dto.operating_status !== "enabled")
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  suspend_reason?: string;

  @IsOptional()
  @Transform(({ value }) => trimNullableOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}
