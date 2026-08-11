import { Transform } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { APARTMENT_GENDER_POLICIES, APARTMENT_ROOM_TYPES } from "@jinhu/shared";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
export class ListApartmentDto { @IsOptional() @IsString() status?: string; @IsOptional() @IsString() keyword?: string; }
export class CreateApartmentRoomDto {
  @IsUUID() unit_id!: string;
  @IsEnum(APARTMENT_ROOM_TYPES) room_type!: string;
  @IsOptional() @IsEnum(APARTMENT_GENDER_POLICIES) gender_policy?: string;
  @IsInt() @Min(1) @Max(20) capacity!: number;
  @IsOptional() @IsArray() @IsString({ each: true }) facilities?: string[];
  @IsOptional() @IsDateString() effective_from?: string;
}
export class UpdateApartmentRoomDto {
  @IsOptional() @IsEnum(APARTMENT_ROOM_TYPES) room_type?: string;
  @IsOptional() @IsEnum(APARTMENT_GENDER_POLICIES) gender_policy?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) capacity?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) facilities?: string[];
  @IsOptional() @IsString() management_status?: string;
}
export class CreateApartmentApplicationDto {
  @IsOptional() @IsUUID() applicant_party_id?: string;
  @IsOptional() @IsUUID() applicant_user_id?: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) applicant_name!: string;
  @IsString() applicant_type!: string;
  @IsOptional() @IsString() @MaxLength(200) organization_name?: string;
  @IsOptional() @IsString() @MaxLength(200) department_name?: string;
  @IsOptional() @IsString() @MaxLength(100) job_title?: string;
  @IsOptional() @IsString() @MaxLength(32) mobile_masked?: string;
  @IsOptional() @IsString() @MaxLength(64) identity_number_masked?: string;
  @IsEnum(APARTMENT_ROOM_TYPES) requested_room_type!: string;
  @IsDateString() requested_start_date!: string;
  @IsOptional() @IsDateString() requested_end_date?: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}
export class DecisionDto { @IsIn(["approve", "reject"]) decision!: "approve" | "reject"; @IsOptional() @IsString() @MaxLength(1000) opinion?: string; }
export class AllocateApartmentDto { @IsUUID() room_id!: string; @IsUUID() bed_id!: string; @IsOptional() @IsDateString() planned_end_date?: string; }
export class HandoverDto {
  @IsOptional() @IsArray() items?: unknown[];
  @IsOptional() @IsArray() keys?: unknown[];
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) photo_file_ids?: string[];
  @IsOptional() @IsString() @MaxLength(1000) exception_note?: string;
}
export class UpdateApartmentSettingsDto { @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(1000) default_application_reason!: string; }
export class CreateTemplateDto { @IsString() document_type!: string; @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) title!: string; @Transform(trim) @IsString() @IsNotEmpty() content_html!: string; @IsInt() @Min(1) version_no!: number; @IsOptional() @IsUUID() template_file_id?: string; @IsOptional() @IsObject() variable_schema?: Record<string, unknown>; }
export class ArchiveDocumentDto { @IsUUID() template_id!: string; @IsOptional() @IsUUID() stay_id?: string; @IsOptional() @IsUUID() application_id?: string; @IsOptional() @IsObject() variables?: Record<string, unknown>; @IsOptional() @IsUUID() generated_file_id?: string; @IsOptional() @IsUUID() signed_file_id?: string; @IsOptional() @IsString() signed_sha256?: string; }
export class GenerateApartmentDocumentDto { @IsUUID() template_id!: string; @IsOptional() @IsUUID() stay_id?: string; @IsOptional() @IsUUID() application_id?: string; @IsOptional() @IsObject() variables?: Record<string, unknown>; }
export class OnlineSignApartmentDocumentDto { @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) signer_name!: string; @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500) statement!: string; @IsOptional() @IsString() @MaxLength(200) client_label?: string; }
export class PaperSignApartmentDocumentDto { @IsUUID() signed_file_id!: string; }
export class VoidApartmentDocumentDto { @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500) reason!: string; }
