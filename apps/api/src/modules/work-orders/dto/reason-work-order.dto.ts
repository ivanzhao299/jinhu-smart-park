import { Transform } from "class-transformer";
import { IsString, MaxLength } from "class-validator";
import { trimOptional } from "./create-work-order.dto";

export class ReasonWorkOrderDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  reason!: string;
}
