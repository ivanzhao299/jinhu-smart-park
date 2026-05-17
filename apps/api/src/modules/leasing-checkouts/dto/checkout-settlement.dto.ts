import { Transform } from "class-transformer";
import { IsNumberString, IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";

export class CheckoutSettlementDto {
  @IsOptional()
  @IsNumberString()
  deduction_amount?: string;

  @IsOptional()
  @IsNumberString()
  additional_charge_amount?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  settlement_remark?: string;
}
