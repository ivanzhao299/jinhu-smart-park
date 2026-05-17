import { Transform } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { LEASING_CONTRACT_SOURCE_TYPES, normalizeArray, optionalInteger, optionalNumber, trimOptional } from "./create-leasing-contract.dto";

export class UpdateLeasingContractDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  contract_code?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  contract_name?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  contract_type?: string;

  @IsOptional()
  @IsUUID()
  park_tenant_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(LEASING_CONTRACT_SOURCE_TYPES)
  source_type?: "manual" | "quote" | "renewal" | "change";

  @IsOptional()
  @IsUUID()
  source_lead_id?: string;

  @IsOptional()
  @IsUUID()
  source_quote_id?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsDateString()
  sign_date?: string;

  @IsOptional()
  @IsDateString()
  effective_date?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  rent_unit_price?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  total_area?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  rent_per_month?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  total_amount?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  deposit_months?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  deposit_amount?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  free_rent_months?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  payment_period?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  payment_advance_days?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  late_fee_rule?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  property_fee_unit_price?: number;

  @IsOptional()
  @Transform(({ value }) => normalizeArray(value))
  @IsArray()
  other_fee_rules?: unknown[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsUUID()
  contract_pdf_file_id?: string;

  @IsOptional()
  @IsUUID()
  scan_pdf_file_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
