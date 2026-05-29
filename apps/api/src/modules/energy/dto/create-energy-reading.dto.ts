import { Transform } from "class-transformer";
import { IsDateString, IsNumber, IsObject, IsOptional, IsString, Min } from "class-validator";
import { optionalNumber, trimOptional } from "./transformers";

export class CreateEnergyReadingDto {
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => optionalNumber(value))
  reading_value!: number;

  @IsOptional()
  @IsDateString()
  reading_time?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  reading_source?: string;

  @IsOptional()
  @IsObject()
  raw_payload?: Record<string, unknown>;
}
