import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : Number.NaN;
}

function optionalStatus(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

export class CreateLeasingContractUnitDto {
  @IsUUID()
  unit_id!: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  area?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  rent_unit_price?: number;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @Transform(({ value }) => optionalStatus(value))
  @IsIn([0, 1])
  status?: number;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}
