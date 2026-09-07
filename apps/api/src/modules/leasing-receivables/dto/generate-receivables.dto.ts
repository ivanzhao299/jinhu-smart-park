import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Matches } from "class-validator";

export const LEASING_RECEIVABLE_BATCH_MAX_SIZE = 50;

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export class GenerateContractReceivablesDto {
  @IsOptional()
  @Transform(({ value }) => optionalBoolean(value))
  @IsBoolean()
  include_rent?: boolean;

  @IsOptional()
  @Transform(({ value }) => optionalBoolean(value))
  @IsBoolean()
  include_deposit?: boolean;

  @IsOptional()
  @Transform(({ value }) => optionalBoolean(value))
  @IsBoolean()
  include_property_fee?: boolean;

  @IsOptional()
  @Transform(({ value }) => optionalBoolean(value))
  @IsBoolean()
  force_regenerate?: boolean;
}

export class GenerateReceivablesBatchDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(LEASING_RECEIVABLE_BATCH_MAX_SIZE)
  @IsUUID(undefined, { each: true })
  contract_ids!: string[];

  @IsString()
  @Matches(/^\d{4}-\d{2}$/u)
  billing_month!: string;
}
