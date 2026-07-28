import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { HOUSING_LEASE_STATUSES, HOUSING_LEDGER_ENTRY_TYPES } from "@jinhu/shared";

const trim = ({ value }: { value: unknown }): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
};

const trimDecimalString = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

export class HousingLeaseQueryDto {
  @IsOptional() @IsIn(HOUSING_LEASE_STATUSES) status?: string;
  @IsOptional() @IsUUID() unit_id?: string;
  @IsOptional() @IsUUID() tenant_party_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 20;
}

export class CreateHousingLeaseDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(64) lease_code?: string;
  @IsUUID() unit_id!: string;
  @IsUUID() tenant_party_id!: string;
  @IsDateString() start_date!: string;
  @IsDateString() end_date!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(120) payment_cycle_months!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(28) billing_day!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) monthly_rent!: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) deposit_amount!: number;
  @IsDateString() first_due_date!: string;
  @IsOptional() @IsIn(["prorate"]) tail_period_rule = "prorate" as const;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?: string;
}

export class HousingReasonDto {
  @Transform(trim) @IsString() @MaxLength(500) reason!: string;
}

export class ApproveHousingLeaseDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) approval_note?: string;
}

export class SignHousingLeaseDto {
  @IsUUID() signature_file_id!: string;
  @IsOptional() @IsDateString() signed_at?: string;
}

export class AddHousingOccupantDto {
  @IsUUID() party_id!: string;
  @IsOptional() @IsIn(["cohabitant", "emergency_contact"]) occupant_role = "cohabitant";
  @IsOptional() @IsBoolean() emergency_contact = false;
}

export class UpsertHousingChargePlanDto {
  @Transform(trim) @IsString() @MaxLength(32) charge_type!: string;
  @IsIn(["fixed", "energy_meter", "manual"]) billing_source!: "fixed" | "energy_meter" | "manual";
  @Type(() => Number) @IsInt() @Min(1) @Max(120) cycle_months!: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) unit_price?: number;
  @IsOptional() @IsUUID() meter_id?: string;
  @IsOptional() @IsBoolean() enabled = true;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?: string;
}

export class GenerateHousingBillsDto {
  @IsDateString() period_start!: string;
  @IsDateString() period_end!: string;
  @IsUUID() charge_plan_id!: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) opening_reading?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) closing_reading?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) manual_amount?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) reason?: string;
}

export class RegisterHousingLedgerEntryDto {
  @IsIn(HOUSING_LEDGER_ENTRY_TYPES) entry_type!: typeof HOUSING_LEDGER_ENTRY_TYPES[number];
  @IsOptional() @IsUUID() receivable_id?: string;
  @Transform(trim) @IsString() @MaxLength(32) charge_type!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(32) payment_method?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) transaction_reference?: string;
  @Transform(trim) @IsString() @MaxLength(500) reason!: string;
}

export class CompleteHousingHandoverDto {
  @IsIn(["move_in", "move_out"]) handover_type!: "move_in" | "move_out";
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsObject({ each: true }) item_snapshot?: Record<string, unknown>[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsObject({ each: true }) meter_readings?: Record<string, unknown>[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsObject({ each: true }) credentials?: Record<string, unknown>[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID("4", { each: true }) photo_file_ids?: string[];
  @IsOptional() @IsUUID() signature_file_id?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) damage_amount = 0;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unsettled_amount = 0;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) deposit_deduction_amount = 0;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?: string;
}

export class CreateHousingRepairDto {
  @Transform(trim) @IsString() @MaxLength(200) title!: string;
  @Transform(trim) @IsString() @MaxLength(2000) description!: string;
  @IsOptional() @IsIn(["low", "medium", "high"]) priority = "medium";
  @IsOptional() @IsIn(["low", "normal", "urgent", "critical"]) urgency = "normal";
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID("4", { each: true }) image_file_ids?: string[];
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?: string;
}

export class HousingPurchaseItemDto {
  @Transform(trim) @IsString() @MaxLength(200) item_name!: string;
  @Transform(trimDecimalString) @IsString() @Matches(/^(?=.*[1-9])(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/)
  quantity!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) unit?: string;
  @Transform(trimDecimalString) @IsString() @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
  unit_price!: string;
}

export class CreateHousingPurchaseDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(64) purchase_code?: string;
  @IsOptional() @IsUUID() unit_id?: string;
  @Transform(trim) @IsString() @MaxLength(200) vendor_name!: string;
  @IsDateString() purchase_date!: string;
  @Transform(trim) @IsString() @MaxLength(64) cost_category!: string;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => HousingPurchaseItemDto)
  items!: HousingPurchaseItemDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID("4", { each: true }) receipt_file_ids?: string[];
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) remark?: string;
}

export class HousingPurchaseQueryDto {
  @IsOptional() @IsIn(["draft", "approved", "rejected", "void"]) approval_status?: string;
  @IsOptional() @IsUUID() unit_id?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 20;
}

export class HousingPurchaseActionDto extends HousingReasonDto {
  @IsIn(["approve", "reject", "pay", "refund", "void"]) action!: string;
}

export class TransferHousingPurchaseDto {
  @IsUUID() lease_id!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID("4", { each: true }) item_ids!: string[];
  @IsDateString() due_date!: string;
  @Transform(trim) @IsString() @MaxLength(500) reason!: string;
}
