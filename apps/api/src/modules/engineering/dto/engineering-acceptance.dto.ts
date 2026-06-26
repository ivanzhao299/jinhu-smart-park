import { Transform } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { EngineeringAcceptanceStatus, EngineeringAcceptanceType, EngineeringRiskLevel } from "../domain/engineering-project.enums";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export class CreateEngineeringAcceptanceDto {
  @IsUUID()
  project_id!: string;

  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  acceptance_name!: string;

  @IsEnum(EngineeringAcceptanceType)
  acceptance_type!: EngineeringAcceptanceType;

  @IsDateString()
  planned_acceptance_date!: string;

  @IsOptional()
  @IsEnum(EngineeringRiskLevel)
  risk_level?: EngineeringRiskLevel;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  acceptance_scope?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  acceptance_criteria?: string;

  @IsOptional()
  @IsUUID()
  responsible_user_id?: string;

  @IsOptional()
  @IsUUID()
  acceptance_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(300)
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
  workflow_instance_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachment_ids?: string[];
}

export class UpdateEngineeringAcceptanceDto {
  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  acceptance_name?: string;

  @IsOptional()
  @IsEnum(EngineeringAcceptanceType)
  acceptance_type?: EngineeringAcceptanceType;

  @IsOptional()
  @IsDateString()
  planned_acceptance_date?: string;

  @IsOptional()
  @IsDateString()
  actual_acceptance_date?: string;

  @IsOptional()
  @IsEnum(EngineeringRiskLevel)
  risk_level?: EngineeringRiskLevel;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  acceptance_scope?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  acceptance_criteria?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  result_summary?: string;

  @IsOptional()
  @IsUUID()
  responsible_user_id?: string;

  @IsOptional()
  @IsUUID()
  acceptance_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(300)
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
  @IsArray()
  @IsUUID(undefined, { each: true })
  attachment_ids?: string[];
}

export class ReviewEngineeringAcceptanceDto {
  @IsBoolean()
  passed!: boolean;

  @IsOptional()
  @IsBoolean()
  rectification_required?: boolean;

  @IsOptional()
  @IsDateString()
  actual_acceptance_date?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  result_summary?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  review_comment?: string;
}

export class EngineeringAcceptanceQueryDto {
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
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(EngineeringAcceptanceType)
  acceptance_type?: EngineeringAcceptanceType;

  @IsOptional()
  @IsEnum(EngineeringAcceptanceStatus)
  acceptance_status?: EngineeringAcceptanceStatus;

  @IsOptional()
  @IsEnum(EngineeringRiskLevel)
  risk_level?: EngineeringRiskLevel;

  @IsOptional()
  @IsUUID()
  responsible_user_id?: string;

  @IsOptional()
  @IsUUID()
  acceptance_org_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsDateString()
  planned_date_from?: string;

  @IsOptional()
  @IsDateString()
  planned_date_to?: string;
}
