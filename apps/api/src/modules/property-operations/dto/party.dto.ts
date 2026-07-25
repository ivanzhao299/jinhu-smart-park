import { PartialType } from "@nestjs/mapped-types";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf
} from "class-validator";
import { PARTY_TYPES, PROPERTY_OCCUPANCY_DOMAINS, type PartyType, type PropertyOccupancyDomain } from "@jinhu/shared";

const optionalTrim = ({ value }: { value: unknown }): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const result = String(value).trim();
  return result || null;
};

export class CreatePartyDto {
  @IsIn(PARTY_TYPES)
  party_type!: PartyType;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  display_name!: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(32)
  mobile?: string | null;

  @IsOptional()
  @Transform(optionalTrim)
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @ValidateIf((dto: CreatePartyDto) => Boolean(dto.identity_number))
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(32)
  identity_document_type?: string | null;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(128)
  identity_number?: string | null;

  @IsOptional()
  @IsIn(PROPERTY_OCCUPANCY_DOMAINS)
  source_domain?: PropertyOccupancyDomain;

  @IsOptional()
  @IsIn(["unverified", "verified", "rejected"])
  verification_status?: string;

  @IsOptional()
  @IsIn(["pending", "granted", "withdrawn"])
  consent_status?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}

export class UpdatePartyDto extends PartialType(CreatePartyDto) {}

export class PartyQueryDto {
  @IsOptional()
  @IsIn(PARTY_TYPES)
  party_type?: PartyType;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(200)
  keyword?: string | null;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
}

export class AddPartyRoleDto {
  @IsUUID()
  party_id!: string;

  @Transform(({ value }) => String(value ?? "").trim())
  @IsString()
  @MaxLength(32)
  role_type!: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(64)
  source_type?: string | null;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(64)
  source_id?: string | null;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}
