import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";

export const LEASING_CONTRACT_CHANGE_TYPES = [
  "term_change",
  "amount_change",
  "unit_change",
  "payment_change",
  "fee_change",
  "mixed",
  "other"
] as const;

export const LEASING_RECEIVABLE_ADJUST_POLICIES = ["no_action", "adjust_future", "manual_review"] as const;

export class CreateLeasingContractChangeDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  change_code?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsIn(LEASING_CONTRACT_CHANGE_TYPES)
  change_type!: (typeof LEASING_CONTRACT_CHANGE_TYPES)[number];

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  change_reason!: string;

  @IsDateString()
  effective_date!: string;

  @IsObject()
  after_snapshot!: Record<string, unknown>;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(LEASING_RECEIVABLE_ADJUST_POLICIES)
  receivable_policy?: (typeof LEASING_RECEIVABLE_ADJUST_POLICIES)[number];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
