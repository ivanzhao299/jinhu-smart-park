import { Transform } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { optionalInteger, trimOptional } from "./create-leasing-contract.dto";

export class CreateContractDraftFromQuoteDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  contract_name?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  payment_advance_days?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  late_fee_rule?: string;
}
