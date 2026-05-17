import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";
import { LEASING_CONTRACT_CHANGE_TYPES, LEASING_RECEIVABLE_ADJUST_POLICIES } from "./create-leasing-contract-change.dto";

export class UpdateLeasingContractChangeDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  change_code?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(LEASING_CONTRACT_CHANGE_TYPES)
  change_type?: (typeof LEASING_CONTRACT_CHANGE_TYPES)[number];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  change_reason?: string;

  @IsOptional()
  @IsDateString()
  effective_date?: string;

  @IsOptional()
  @IsObject()
  after_snapshot?: Record<string, unknown>;

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
