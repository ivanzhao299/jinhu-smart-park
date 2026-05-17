import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";

export const LEASING_CHECKOUT_TYPES = ["normal_expiry", "early_termination", "breach_termination", "other"] as const;
export const LEASING_RELEASE_UNIT_STATUSES = ["rentable", "maintenance"] as const;

export class CreateLeasingCheckoutDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  checkout_code?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsIn(LEASING_CHECKOUT_TYPES)
  checkout_type!: (typeof LEASING_CHECKOUT_TYPES)[number];

  @IsDateString()
  planned_checkout_date!: string;

  @IsOptional()
  @IsDateString()
  actual_checkout_date?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsIn(LEASING_RELEASE_UNIT_STATUSES)
  release_unit_status!: (typeof LEASING_RELEASE_UNIT_STATUSES)[number];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  settlement_remark?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
