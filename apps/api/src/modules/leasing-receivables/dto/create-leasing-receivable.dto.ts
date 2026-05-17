import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export const LEASING_RECEIVABLE_SOURCE_TYPES = ["contract", "manual", "adjustment"] as const;

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

export class CreateLeasingReceivableDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  ar_code?: string;

  @IsOptional()
  @IsUUID()
  contract_id?: string;

  @IsUUID()
  park_tenant_id!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  fee_type!: string;

  @IsDateString()
  period_start!: string;

  @IsDateString()
  period_end!: string;

  @IsDateString()
  due_date!: string;

  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  amount_due!: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  amount_paid?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  amount_waived?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  late_fee?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  invoice_status?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsIn(LEASING_RECEIVABLE_SOURCE_TYPES)
  source_type?: "contract" | "manual" | "adjustment";

  @IsOptional()
  @IsUUID()
  source_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  generate_batch_no?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
