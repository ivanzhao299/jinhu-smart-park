import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";
import { LEASING_CHECKOUT_TYPES, LEASING_RELEASE_UNIT_STATUSES } from "./create-leasing-checkout.dto";

export class UpdateLeasingCheckoutDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  checkout_code?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(LEASING_CHECKOUT_TYPES)
  checkout_type?: (typeof LEASING_CHECKOUT_TYPES)[number];

  @IsOptional()
  @IsDateString()
  planned_checkout_date?: string;

  @IsOptional()
  @IsDateString()
  actual_checkout_date?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(LEASING_RELEASE_UNIT_STATUSES)
  release_unit_status?: (typeof LEASING_RELEASE_UNIT_STATUSES)[number];

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
