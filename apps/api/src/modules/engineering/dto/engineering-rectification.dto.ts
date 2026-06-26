import { Transform } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { EngineeringIssueSeverity, EngineeringRectificationStatus } from "../domain/engineering-project.enums";
import { EngineeringRectificationAction } from "../domain/engineering-rectification-state-machine.types";

function trimOptional(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

export class CreateEngineeringRectificationDto {
  @IsUUID()
  project_id!: string;

  @IsOptional()
  @IsUUID()
  issue_id?: string;

  @IsOptional()
  @IsUUID()
  inspection_id?: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  rectification_title!: string;

  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(EngineeringIssueSeverity)
  severity!: EngineeringIssueSeverity;

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
  @IsDateString()
  deadline?: string;

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

export class UpdateEngineeringRectificationDto {
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(200)
  rectification_title?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(EngineeringIssueSeverity)
  severity?: EngineeringIssueSeverity;

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
  @IsDateString()
  deadline?: string;

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

export class EngineeringRectificationQueryDto {
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
  issue_id?: string;

  @IsOptional()
  @IsUUID()
  inspection_id?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(EngineeringRectificationStatus)
  status?: EngineeringRectificationStatus;

  @IsOptional()
  @IsEnum(EngineeringIssueSeverity)
  severity?: EngineeringIssueSeverity;

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
  @IsDateString()
  deadline_from?: string;

  @IsOptional()
  @IsDateString()
  deadline_to?: string;
}

export class EngineeringRectificationActionDto {
  @IsEnum(EngineeringRectificationAction)
  action!: EngineeringRectificationAction;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  reason?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  comment?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  feedback?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  recheck_comment?: string;
}
