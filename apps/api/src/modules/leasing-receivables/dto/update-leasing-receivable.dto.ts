import { Transform } from "class-transformer";
import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "./create-leasing-receivable.dto";

export class UpdateLeasingReceivableDto {
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
