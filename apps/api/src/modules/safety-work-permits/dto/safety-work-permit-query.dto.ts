import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { optionalInteger, trimOptional } from "../../safety-emergency/dto/transformers";

export class SafetyWorkPermitQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  permit_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  status?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  risk_level?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  apply_park_tenant_id?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  building_id?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  unit_id?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  start_date?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  end_date?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  sort?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => optionalInteger(value))
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Transform(({ value }) => optionalInteger(value))
  page_size?: number;
}
