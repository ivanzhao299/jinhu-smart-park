import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";

export class LeasingContractChangeActionDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  opinion?: string;
}

export class RejectLeasingContractChangeDto extends LeasingContractChangeActionDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  reject_reason!: string;
}
