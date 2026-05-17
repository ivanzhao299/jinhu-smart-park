import { Transform } from "class-transformer";
import { IsArray, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { normalizeArray, trimOptional } from "./create-leasing-contract.dto";

export class LeasingContractApprovalActionDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  opinion?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeArray(value))
  @IsArray()
  attachments?: unknown[];
}

export class RejectLeasingContractDto extends LeasingContractApprovalActionDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  reject_reason!: string;
}

export class ArchiveLeasingContractDto extends LeasingContractApprovalActionDto {
  @IsUUID()
  contract_pdf_file_id!: string;

  @IsUUID()
  scan_pdf_file_id!: string;

  @IsDateString()
  sign_date!: string;

  @IsOptional()
  @IsDateString()
  effective_date?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class EffectiveLeasingContractDto extends LeasingContractApprovalActionDto {
  @IsDateString()
  effective_date!: string;
}
