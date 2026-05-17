import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";

export class LeasingCheckoutActionDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  opinion?: string;
}

export class RejectLeasingCheckoutDto extends LeasingCheckoutActionDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  reject_reason!: string;
}
