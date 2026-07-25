import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from "class-validator";
import { PROPERTY_OPERATING_STATUSES, type PropertyOperatingStatus } from "@jinhu/shared";

const trimOptional = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
};

export class ConfigurePropertyUnitDto {
  @IsOptional()
  @IsUUID()
  asset_unit_id?: string;

  @IsIn(PROPERTY_OPERATING_STATUSES)
  operating_status!: PropertyOperatingStatus;

  @ValidateIf((dto: ConfigurePropertyUnitDto) => dto.operating_status !== "enabled")
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  suspend_reason?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
