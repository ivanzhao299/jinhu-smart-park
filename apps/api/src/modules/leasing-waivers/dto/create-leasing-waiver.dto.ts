import { Transform } from "class-transformer";
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { optionalNumber, trimOptional } from "../../leasing-receivables/dto/create-leasing-receivable.dto";

export class CreateLeasingWaiverDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  waiver_code?: string;

  @IsUUID()
  receivable_id!: string;

  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0.01)
  waiver_amount!: number;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
