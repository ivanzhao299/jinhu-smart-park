import { Transform } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import {
  EngineeringAssetStatus,
  EngineeringFinanceStatus,
  EngineeringProjectLevel,
  EngineeringProjectStatus,
  EngineeringProjectType,
  EngineeringRiskLevel,
  EngineeringTransferStatus
} from "../domain/engineering-project.enums";

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

function optionalInteger(value: unknown): number | undefined {
  const numberValue = optionalNumber(value);
  return numberValue === undefined ? undefined : Math.trunc(numberValue);
}

export class CreateEngineeringProjectDto {
  @IsOptional()
  @IsUUID()
  org_id?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  project_name!: string;

  @IsEnum(EngineeringProjectType)
  project_type!: EngineeringProjectType;

  @IsOptional()
  @IsEnum(EngineeringProjectLevel)
  project_level?: EngineeringProjectLevel;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  project_source?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  description?: string;

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
  @IsDateString()
  planned_start_date?: string;

  @IsOptional()
  @IsDateString()
  planned_end_date?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  budget_amount?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  contract_amount?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  settlement_amount?: number;

  @IsOptional()
  @IsUUID()
  project_manager_id?: string;

  @IsOptional()
  @IsUUID()
  engineering_director_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @IsEnum(EngineeringRiskLevel)
  risk_level?: EngineeringRiskLevel;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateEngineeringProjectDto {
  @IsOptional()
  @IsUUID()
  org_id?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  project_name?: string;

  @IsOptional()
  @IsEnum(EngineeringProjectType)
  project_type?: EngineeringProjectType;

  @IsOptional()
  @IsEnum(EngineeringProjectLevel)
  project_level?: EngineeringProjectLevel;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(64)
  project_source?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  description?: string;

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
  @IsDateString()
  planned_start_date?: string;

  @IsOptional()
  @IsDateString()
  planned_end_date?: string;

  @IsOptional()
  @IsDateString()
  actual_start_date?: string;

  @IsOptional()
  @IsDateString()
  actual_end_date?: string;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  budget_amount?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  contract_amount?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  settlement_amount?: number;

  @IsOptional()
  @IsUUID()
  project_manager_id?: string;

  @IsOptional()
  @IsUUID()
  engineering_director_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsUUID()
  supervisor_org_id?: string;

  @IsOptional()
  @Transform(({ value }) => optionalInteger(value))
  @IsInt()
  @Min(0)
  @Max(100)
  progress_percent?: number;

  @IsOptional()
  @IsEnum(EngineeringRiskLevel)
  risk_level?: EngineeringRiskLevel;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  @Max(100)
  quality_score?: number;

  @IsOptional()
  @Transform(({ value }) => optionalNumber(value))
  @IsNumber()
  @Min(0)
  @Max(100)
  safety_score?: number;

  @IsOptional()
  @IsUUID()
  workflow_instance_id?: string;

  @IsOptional()
  @IsEnum(EngineeringTransferStatus)
  transfer_status?: EngineeringTransferStatus;

  @IsOptional()
  @IsEnum(EngineeringFinanceStatus)
  finance_status?: EngineeringFinanceStatus;

  @IsOptional()
  @IsEnum(EngineeringAssetStatus)
  asset_status?: EngineeringAssetStatus;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class EngineeringProjectQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(EngineeringProjectType)
  project_type?: EngineeringProjectType;

  @IsOptional()
  @IsEnum(EngineeringProjectStatus)
  status?: EngineeringProjectStatus;

  @IsOptional()
  @IsEnum(EngineeringProjectLevel)
  project_level?: EngineeringProjectLevel;

  @IsOptional()
  @IsEnum(EngineeringRiskLevel)
  risk_level?: EngineeringRiskLevel;

  @IsOptional()
  @IsUUID()
  org_id?: string;

  @IsOptional()
  @IsUUID()
  project_manager_id?: string;

  @IsOptional()
  @IsUUID()
  contractor_org_id?: string;

  @IsOptional()
  @IsDateString()
  planned_start_from?: string;

  @IsOptional()
  @IsDateString()
  planned_start_to?: string;
}

export interface EngineeringProjectListItemDto {
  id: string;
  tenantId: string;
  orgId: string | null;
  parkId: string;
  projectCode: string;
  projectName: string;
  projectType: EngineeringProjectType;
  projectLevel: EngineeringProjectLevel;
  projectSource: string | null;
  locationText: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  projectManagerId: string | null;
  engineeringDirectorId: string | null;
  contractorOrgId: string | null;
  status: EngineeringProjectStatus;
  progressPercent: number;
  riskLevel: EngineeringRiskLevel;
  transferStatus: EngineeringTransferStatus;
  financeStatus: EngineeringFinanceStatus;
  assetStatus: EngineeringAssetStatus;
  createTime: Date;
  updateTime: Date;
}

export interface EngineeringProjectDetailDto extends EngineeringProjectListItemDto {
  description: string | null;
  buildingId: string | null;
  floorId: string | null;
  spaceId: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  budgetAmount: string | null;
  contractAmount: string | null;
  settlementAmount: string | null;
  supervisorOrgId: string | null;
  qualityScore: string | null;
  safetyScore: string | null;
  workflowInstanceId: string | null;
  remark: string | null;
}
