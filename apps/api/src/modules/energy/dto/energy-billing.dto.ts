import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { PartialType } from "@nestjs/mapped-types";

export const ENERGY_BILLING_CYCLE_STATUS = ["DRAFT", "CALCULATED", "CONFIRMED", "POSTED", "CANCELLED"] as const;
export const ENERGY_BILLING_METHODS = ["DIRECT_METER", "PUBLIC_ALLOCATION", "MANUAL_ADJUST"] as const;
export const ENERGY_BILLING_ITEM_STATUS = ["PENDING", "CONFIRMED", "DISPUTED"] as const;
export const ENERGY_ALLOCATION_SCOPE = ["BUILDING", "FLOOR", "AREA", "PARK"] as const;
export const ENERGY_ALLOCATION_METHOD = ["AREA_RATIO", "TENANT_COUNT", "ROOM_COUNT", "MANUAL_RATIO"] as const;
export const ENERGY_BILLING_ADJUSTMENT_TYPES = ["REVERSAL", "ADJUSTMENT"] as const;
export const ENERGY_BILLING_ADJUSTMENT_STATUS = ["DRAFT", "APPROVED", "POSTED", "CANCELLED"] as const;

export function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

export class CreateEnergyBillingCycleDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  cycle_code?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(160)
  cycle_name!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  meter_type!: string;

  @IsDateString()
  start_date!: string;

  @IsDateString()
  end_date!: string;

  @IsOptional()
  @IsObject()
  unit_prices?: Record<string, number>;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class EnergyBillingCycleQueryDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  meter_type?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(ENERGY_BILLING_CYCLE_STATUS)
  status?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value) ?? 1)
  @IsNumber()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value) ?? 20)
  @IsNumber()
  @Min(1)
  page_size = 20;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  sort?: string;
}

export class EnergyBillingItemQueryDto {
  @IsOptional()
  @IsUUID()
  cycle_id?: string;

  @IsOptional()
  @IsUUID()
  related_park_tenant_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(ENERGY_BILLING_METHODS)
  billing_method?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(ENERGY_BILLING_ITEM_STATUS)
  confirmation_status?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value) ?? 1)
  @IsNumber()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value) ?? 50)
  @IsNumber()
  @Min(1)
  page_size = 50;
}

export class AdjustEnergyBillingItemDto {
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  adjustment_amount!: number;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  adjustment_reason!: string;
}

export class DisputeEnergyBillingItemDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  dispute_reason!: string;
}

export class CreateEnergyAllocationRuleDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(160)
  rule_name!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  meter_type!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsIn(ENERGY_ALLOCATION_SCOPE)
  allocation_scope!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsIn(ENERGY_ALLOCATION_METHOD)
  allocation_method!: string;

  @IsUUID()
  public_meter_id!: string;

  @IsOptional()
  @IsUUID()
  scope_id?: string;

  @IsOptional()
  @IsObject()
  rule_config_json?: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(["ENABLED", "DISABLED"])
  status?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateEnergyAllocationRuleDto extends PartialType(CreateEnergyAllocationRuleDto) {}

export class EnergyAllocationRuleQueryDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  meter_type?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value) ?? 1)
  @IsNumber()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value) ?? 20)
  @IsNumber()
  @Min(1)
  page_size = 20;
}

export class CreateEnergyBillingAdjustmentDto {
  @IsUUID()
  billing_item_id!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsIn(ENERGY_BILLING_ADJUSTMENT_TYPES)
  adjustment_type!: "REVERSAL" | "ADJUSTMENT";

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  adjustment_amount?: number;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  adjustment_reason!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class EnergyBillingAdjustmentQueryDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string;

  @IsOptional()
  @IsUUID()
  billing_item_id?: string;

  @IsOptional()
  @IsUUID()
  cycle_id?: string;

  @IsOptional()
  @IsUUID()
  related_park_tenant_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(ENERGY_BILLING_ADJUSTMENT_TYPES)
  adjustment_type?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(ENERGY_BILLING_ADJUSTMENT_STATUS)
  status?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value) ?? 1)
  @IsNumber()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value) ?? 20)
  @IsNumber()
  @Min(1)
  page_size = 20;
}
