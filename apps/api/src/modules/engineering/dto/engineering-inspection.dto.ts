import { Transform } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import {
  EngineeringInspectionStatus,
  EngineeringInspectionType,
  EngineeringIssueSeverity,
  EngineeringIssueSourceType,
  EngineeringIssueStatus,
  EngineeringIssueType
} from "../domain/engineering-project.enums";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : Number.NaN;
}

export class CreateEngineeringInspectionDto {
  @IsUUID()
  project_id!: string;

  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsOptional()
  @IsUUID()
  daily_report_id?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  inspection_title!: string;

  @IsEnum(EngineeringInspectionType)
  inspection_type!: EngineeringInspectionType;

  @IsDateString()
  inspection_date!: string;

  @IsOptional()
  @IsUUID()
  inspector_user_id?: string;

  @IsOptional()
  @IsUUID()
  inspector_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  location_text?: string;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @IsUUID()
  space_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  overall_result?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  issue_count?: number;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  critical_issue_count?: number;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachment_ids?: string[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateEngineeringInspectionDto {
  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsOptional()
  @IsUUID()
  daily_report_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  inspection_title?: string;

  @IsOptional()
  @IsEnum(EngineeringInspectionType)
  inspection_type?: EngineeringInspectionType;

  @IsOptional()
  @IsDateString()
  inspection_date?: string;

  @IsOptional()
  @IsUUID()
  inspector_user_id?: string;

  @IsOptional()
  @IsUUID()
  inspector_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  location_text?: string;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @IsUUID()
  space_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  overall_result?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  issue_count?: number;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  critical_issue_count?: number;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachment_ids?: string[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class EngineeringInspectionQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value, obj }) => Number(value ?? (obj as { pageSize?: unknown }).pageSize ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsOptional()
  @IsUUID()
  daily_report_id?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(EngineeringInspectionType)
  inspection_type?: EngineeringInspectionType;

  @IsOptional()
  @IsEnum(EngineeringInspectionStatus)
  inspection_status?: EngineeringInspectionStatus;

  @IsOptional()
  @IsUUID()
  inspector_user_id?: string;

  @IsOptional()
  @IsUUID()
  inspector_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @IsDateString()
  inspection_date_from?: string;

  @IsOptional()
  @IsDateString()
  inspection_date_to?: string;
}

export class CreateEngineeringIssueDto {
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  issue_title!: string;

  @IsEnum(EngineeringIssueType)
  issue_type!: EngineeringIssueType;

  @IsEnum(EngineeringIssueSeverity)
  severity!: EngineeringIssueSeverity;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsOptional()
  @IsUUID()
  inspection_id?: string;

  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsOptional()
  @IsUUID()
  daily_report_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  location_text?: string;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @IsUUID()
  space_id?: string;

  @IsOptional()
  @IsUUID()
  responsible_user_id?: string;

  @IsOptional()
  @IsUUID()
  responsible_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsEnum(EngineeringIssueSourceType)
  source_type?: EngineeringIssueSourceType;

  @IsOptional()
  @IsUUID()
  source_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachment_ids?: string[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateEngineeringIssueDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  issue_title?: string;

  @IsOptional()
  @IsEnum(EngineeringIssueType)
  issue_type?: EngineeringIssueType;

  @IsOptional()
  @IsEnum(EngineeringIssueSeverity)
  severity?: EngineeringIssueSeverity;

  @IsOptional()
  @IsEnum(EngineeringIssueStatus)
  issue_status?: EngineeringIssueStatus;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsOptional()
  @IsUUID()
  daily_report_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  location_text?: string;

  @IsOptional()
  @IsUUID()
  building_id?: string;

  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @IsOptional()
  @IsUUID()
  space_id?: string;

  @IsOptional()
  @IsUUID()
  responsible_user_id?: string;

  @IsOptional()
  @IsUUID()
  responsible_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsUUID()
  rectification_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachment_ids?: string[];

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class EngineeringIssueQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value, obj }) => Number(value ?? (obj as { pageSize?: unknown }).pageSize ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsOptional()
  @IsUUID()
  inspection_id?: string;

  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsOptional()
  @IsUUID()
  daily_report_id?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(EngineeringIssueType)
  issue_type?: EngineeringIssueType;

  @IsOptional()
  @IsEnum(EngineeringIssueSeverity)
  severity?: EngineeringIssueSeverity;

  @IsOptional()
  @IsEnum(EngineeringIssueStatus)
  issue_status?: EngineeringIssueStatus;

  @IsOptional()
  @IsUUID()
  responsible_user_id?: string;

  @IsOptional()
  @IsUUID()
  responsible_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @IsDateString()
  deadline_from?: string;

  @IsOptional()
  @IsDateString()
  deadline_to?: string;
}
