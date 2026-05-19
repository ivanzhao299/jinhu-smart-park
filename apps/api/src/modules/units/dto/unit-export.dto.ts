import { Transform } from "class-transformer";
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class UnitExportDto {
  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsIn([10, 20, 30, 40, 50, 60])
  usage_type?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsIn([10, 20, 30, 40, 50, 60, 70])
  rental_status?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsIn([10, 20, 30])
  fitting_status?: number;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  min_area?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  max_area?: number;
}
