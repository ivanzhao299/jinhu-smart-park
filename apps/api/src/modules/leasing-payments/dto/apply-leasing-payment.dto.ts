import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsNumber, IsUUID, Min, ValidateNested } from "class-validator";

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
  @ValidateNested({ each: true })
  @Type(() => LeasingPaymentApplicationDto)
  applications!: LeasingPaymentApplicationDto[];
}
