import { Transform } from "class-transformer";
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { optionalNumber, trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";

export class UpdateLeasingPaymentDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  pay_code?: string;

  @IsOptional()
  @IsUUID()
  park_tenant_id?: string;

  @IsOptional()
  @IsDateString()
  pay_time?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  pay_method?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0.01)
  pay_amount?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  payer_name?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  bank_serial?: string;

  @IsOptional()
  @IsUUID()
  receipt_file_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
