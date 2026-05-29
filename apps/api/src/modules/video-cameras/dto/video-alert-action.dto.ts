import { IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class VideoAlertActionDto {
  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsUUID()
  assigned_to?: string;
}

export class AssignVideoAlertDto {
  @IsUUID()
  assigned_to!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreateVideoAlertInspectionDto {
  @IsOptional()
  @IsUUID()
  template_id?: string;

  @IsOptional()
  @IsUUID()
  point_id?: string;

  @IsOptional()
  @IsUUID()
  handler_id?: string;

  @IsOptional()
  @IsString()
  handler_name?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreateVideoAlertHazardDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  hazard_type?: string;

  @IsOptional()
  @IsString()
  risk_level?: string;

  @IsOptional()
  @IsString()
  rectify_deadline?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
