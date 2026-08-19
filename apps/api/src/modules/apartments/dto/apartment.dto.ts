import { Transform, Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";
import { APARTMENT_GENDER_POLICIES, APARTMENT_ROOM_TYPES } from "@jinhu/shared";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;
export class ListApartmentDto { @IsOptional() @IsString() status?: string; @IsOptional() @IsString() keyword?: string; }
export class ApartmentUnitCandidateQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 20;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsUUID() building_id?: string;
  @IsOptional() @IsUUID() floor_id?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === "true") @IsBoolean() eligible_only = false;
}
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
  @IsOptional() @IsIn(["enabled", "disabled"]) management_status?: "enabled" | "disabled";
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
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) emergency_contact_name!: string;
  @Transform(trim) @IsString() @Matches(/^1\d{10}$/, { message: "紧急联系人手机号格式不正确" }) emergency_contact_mobile!: string;
  @IsInt() @Min(1) @Max(10) household_size!: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) accompanying_names?: string;
  @IsOptional() @Transform(trim) @IsString() @Matches(/^[\u4e00-\u9fa5A-Z0-9·-]{5,10}$/i, { message: "车牌号格式不正确" }) vehicle_plate?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) accommodation_notes?: string;
  @IsBoolean() @IsIn([true], { message: "必须确认公寓管理与安全承诺" }) policy_accepted!: boolean;
  @IsEnum(APARTMENT_ROOM_TYPES) requested_room_type!: string;
  @IsDateString() requested_start_date!: string;
  @IsOptional() @IsDateString() requested_end_date?: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}
export class DecisionDto {
  @IsIn(["approve", "reject"]) decision!: "approve" | "reject";
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(1000) opinion!: string;
  @IsOptional() @IsDateString() approved_start_date?: string;
  @IsOptional() @IsDateString() approved_end_date?: string;
  @IsOptional() @IsIn(["company", "employee", "shared", "waived"]) cost_bearer?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,10}(\.\d{1,2})?$/, { message: "押金必须是最多两位小数的非负数" }) deposit_amount?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,10}(\.\d{1,2})?$/, { message: "月度费用必须是最多两位小数的非负数" }) monthly_fee?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) allocation_note?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) safety_requirements?: string;
}
export class AllocateApartmentDto { @IsUUID() room_id!: string; @IsUUID() bed_id!: string; @IsOptional() @IsDateString() planned_end_date?: string; }
export class HandoverDto {
  @IsArray() @IsObject({ each: true }) items!: Record<string, unknown>[];
  @IsArray() @IsObject({ each: true }) keys!: Record<string, unknown>[];
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) photo_file_ids?: string[];
  @IsOptional() @IsString() @Matches(/^\d{1,10}(\.\d{1,3})?$/, { message: "水表读数格式不正确" }) water_meter_reading?: string;
  @IsOptional() @IsString() @Matches(/^\d{1,10}(\.\d{1,3})?$/, { message: "电表读数格式不正确" }) electricity_meter_reading?: string;
  @IsOptional() @IsString() @MaxLength(1000) exception_note?: string;
}
export class UpdateApartmentSettingsDto { @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(1000) default_application_reason!: string; }
export class CreateTemplateDto { @IsString() document_type!: string; @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) title!: string; @Transform(trim) @IsString() @IsNotEmpty() content_html!: string; @IsInt() @Min(1) version_no!: number; @IsOptional() @IsUUID() template_file_id?: string; @IsOptional() @IsObject() variable_schema?: Record<string, unknown>; }
export class ArchiveDocumentDto { @IsUUID() template_id!: string; @IsOptional() @IsUUID() stay_id?: string; @IsOptional() @IsUUID() application_id?: string; @IsOptional() @IsObject() variables?: Record<string, unknown>; @IsOptional() @IsUUID() generated_file_id?: string; @IsOptional() @IsUUID() signed_file_id?: string; @IsOptional() @IsString() signed_sha256?: string; }
export class GenerateApartmentDocumentDto { @IsUUID() template_id!: string; @IsOptional() @IsUUID() stay_id?: string; @IsOptional() @IsUUID() application_id?: string; @IsOptional() @IsObject() variables?: Record<string, unknown>; }
export class OnlineSignApartmentDocumentDto { @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) signer_name!: string; @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500) statement!: string; @IsOptional() @IsString() @MaxLength(200) client_label?: string; }
export class PaperSignApartmentDocumentDto { @IsUUID() signed_file_id!: string; }
export class VoidApartmentDocumentDto { @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500) reason!: string; }
