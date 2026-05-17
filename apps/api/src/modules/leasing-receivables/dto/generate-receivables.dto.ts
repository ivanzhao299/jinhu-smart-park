import { Transform } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Matches } from "class-validator";

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
  @IsUUID(undefined, { each: true })
  contract_ids!: string[];

  @IsString()
  @Matches(/^\d{4}-\d{2}$/u)
  billing_month!: string;
}
