import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { trimOptional } from "./create-work-order.dto";

export class ConfirmWorkOrderDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  confirm_note?: string;
}
