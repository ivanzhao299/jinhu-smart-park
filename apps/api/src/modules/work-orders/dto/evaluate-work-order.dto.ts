import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { optionalInteger, trimOptional } from "./create-work-order.dto";

export class EvaluateWorkOrderDto {
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(1)
  @Max(5)
  satisfaction!: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(1000)
  evaluation?: string;
}
