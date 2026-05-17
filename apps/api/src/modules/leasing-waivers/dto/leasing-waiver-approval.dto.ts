import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";

export class LeasingWaiverApprovalDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  opinion?: string;
}

export class RejectLeasingWaiverDto extends LeasingWaiverApprovalDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reject_reason!: string;
}
