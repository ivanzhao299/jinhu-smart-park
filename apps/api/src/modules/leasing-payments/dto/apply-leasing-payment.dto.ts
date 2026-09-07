import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNumber, IsUUID, Min, ValidateNested } from "class-validator";

export const LEASING_PAYMENT_APPLICATION_MAX_SIZE = 50;

export class LeasingPaymentApplicationDto {
  @IsUUID()
  receivable_id!: string;

  @IsNumber()
  @Min(0.01)
  applied_amount!: number;
}

export class ApplyLeasingPaymentDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(LEASING_PAYMENT_APPLICATION_MAX_SIZE)
  @ValidateNested({ each: true })
  @Type(() => LeasingPaymentApplicationDto)
  applications!: LeasingPaymentApplicationDto[];
}
