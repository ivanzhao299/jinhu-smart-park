import { Transform, Type } from "class-transformer";
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";
import { optionalNumber, trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";

export class LeasingInvoiceReceivableInputDto {
  @IsUUID()
  receivable_id!: string;

  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0.01)
  invoice_amount!: number;
}

export class CreateLeasingInvoiceDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  invoice_code?: string;

  @IsUUID()
  park_tenant_id!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  invoice_type!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  buyer_name!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  buyer_tax_no?: string;

  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  tax_rate?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  invoice_no?: string;

  @IsDateString()
  invoice_date!: string;

  @IsOptional()
  @IsUUID()
  file_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeasingInvoiceReceivableInputDto)
  receivables!: LeasingInvoiceReceivableInputDto[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
