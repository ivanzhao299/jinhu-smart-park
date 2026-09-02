import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateNested
} from "class-validator";
import type { ValidatorConstraintInterface } from "class-validator";
import { ValidatorConstraint } from "class-validator";
import { isBusinessDate } from "../homestay-booking.policy";
import { UNIT_USAGE_TYPES, type UnitUsageType } from "@jinhu/shared";

const trimOptional = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
};
const trimDecimalString = (value: unknown): unknown =>
  typeof value === "string" ? value.trim() : value;
const HOMESTAY_MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const HOMESTAY_POSITIVE_MONEY_PATTERN = /^(?=.*[1-9])(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

@ValidatorConstraint({ name: "homestayBusinessDate", async: false })
class HomestayBusinessDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === "string" && isBusinessDate(value);
  }

  defaultMessage(): string {
    return "must be a valid YYYY-MM-DD calendar date";
  }
}

export class HomestayBookingQueryDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsIn(["draft", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"])
  status?: string;

  @IsOptional()
  @IsUUID()
  unit_id?: string;

  @IsOptional()
  @Validate(HomestayBusinessDateConstraint)
  date_from?: string;

  @IsOptional()
  @Validate(HomestayBusinessDateConstraint)
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
}

export class HomestayUnitCandidateQueryDto {
  @IsOptional()
  @IsUUID()
  unit_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn(UNIT_USAGE_TYPES)
  usage_type?: UnitUsageType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
}

export class HomestayCandidateQueryDto extends HomestayUnitCandidateQueryDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  keyword?: string;

}

export class HomestayGuestCandidateQueryDto extends HomestayUnitCandidateQueryDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^(?=(?:.*[^%_\\\s]){2,}).*$/u, {
    message: "keyword must contain at least two literal search characters"
  })
  keyword!: string;

  @IsUUID()
  booking_id!: string;
}

export class HomestayAvailabilityQueryDto extends HomestayUnitCandidateQueryDto {
  @Validate(HomestayBusinessDateConstraint)
  date_from!: string;

  @Validate(HomestayBusinessDateConstraint)
  date_to!: string;
}

export class HomestayTaskQueryDto extends HomestayUnitCandidateQueryDto {
  @IsOptional()
  @IsIn(["pending", "active", "completed", "exception"])
  status?: "pending" | "active" | "completed" | "exception";

  @IsOptional()
  @IsIn(["homestay_arrival", "homestay_departure", "homestay_turnover"])
  source_type?: "homestay_arrival" | "homestay_departure" | "homestay_turnover";

  @IsOptional()
  @Validate(HomestayBusinessDateConstraint)
  business_date?: string;
}

export class HomestayStayQueryDto extends HomestayUnitCandidateQueryDto {
  @IsOptional()
  @IsIn(["all", "arrivals", "departures", "in_house"])
  queue: "all" | "arrivals" | "departures" | "in_house" = "all";

  @IsOptional()
  @Validate(HomestayBusinessDateConstraint)
  business_date?: string;
}

export class HomestayFinanceQueryDto extends HomestayUnitCandidateQueryDto {
  @IsOptional()
  @IsIn(["draft", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"])
  status?: string;
}

export class HomestayTurnoverQueryDto {
  @IsOptional()
  @IsIn(["open", "pending", "cleaning", "inspection", "completed", "exception"])
  status: "open" | "pending" | "cleaning" | "inspection" | "completed" | "exception" = "open";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
}

export class UpsertHomestayRateDto {
  @Transform(({ value }) => trimDecimalString(value))
  @IsString()
  @Matches(HOMESTAY_MONEY_PATTERN)
  base_daily_rate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(8760)
  free_cancel_before_hours = 24;

  @IsOptional()
  @IsIn(["fixed", "percentage"])
  late_cancel_fee_type: "fixed" | "percentage" = "fixed";

  @IsOptional()
  @Transform(({ value }) => trimDecimalString(value))
  @IsString()
  @Matches(HOMESTAY_MONEY_PATTERN)
  late_cancel_fee_value = "0";

  @IsOptional()
  @IsBoolean()
  checkout_requires_inspection = false;
}

export class UpsertHomestayRateOverrideDto {
  @Validate(HomestayBusinessDateConstraint)
  business_date!: string;

  @Transform(({ value }) => trimDecimalString(value))
  @IsString()
  @Matches(HOMESTAY_POSITIVE_MONEY_PATTERN)
  daily_rate!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class CreateHomestayBookingDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  booking_code?: string;

  @IsUUID()
  unit_id!: string;

  @IsOptional()
  @IsUUID()
  booker_party_id?: string;

  @Validate(HomestayBusinessDateConstraint)
  arrival_date!: string;

  @Validate(HomestayBusinessDateConstraint)
  departure_date!: string;

  @IsOptional()
  @IsDateString()
  expected_arrival_time?: string;

  @IsOptional()
  @IsIn(["direct", "manual", "ota_reserved"])
  source_type: "direct" | "manual" | "ota_reserved" = "direct";

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  channel_name?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  external_order_no?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  guest_count = 1;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class HomestayReasonDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class RescheduleHomestayBookingDto extends HomestayReasonDto {
  @Validate(HomestayBusinessDateConstraint)
  arrival_date!: string;

  @Validate(HomestayBusinessDateConstraint)
  departure_date!: string;
}

export class AddHomestayGuestDto {
  @IsUUID()
  party_id!: string;

  @IsOptional()
  @IsBoolean()
  is_primary = false;

  @IsOptional()
  @IsIn(["unverified", "verified", "rejected"])
  verification_status: "unverified" | "verified" | "rejected" = "unverified";
}

export class IssueHomestayCredentialDto {
  @IsIn(["key", "card", "voucher"])
  credential_type!: "key" | "card" | "voucher";

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  credential_label!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  credential_reference?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  lock_device_id?: string;
}

export class RegisterHomestayLedgerEntryDto {
  @IsIn(["charge", "payment", "refund", "waiver"])
  entry_type!: "charge" | "payment" | "refund" | "waiver";

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  charge_type!: string;

  @Transform(({ value }) => trimDecimalString(value))
  @IsString()
  @Matches(HOMESTAY_POSITIVE_MONEY_PATTERN)
  amount!: string;

  @IsOptional()
  @IsUUID()
  source_ledger_entry_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  payment_method?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  payment_channel?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  transaction_reference?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class HomestayConsumableDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(20)
  unit?: string;
}

export class ExecuteHomestayTurnoverDto {
  @IsOptional()
  @IsUUID()
  assignee_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  assignee_name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID("4", { each: true })
  photo_file_ids?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => HomestayConsumableDto)
  consumables?: HomestayConsumableDto[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(1000)
  exception_description?: string;

  @IsOptional()
  @IsUUID()
  linked_work_order_id?: string;
}
