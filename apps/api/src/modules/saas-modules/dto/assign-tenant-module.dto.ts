import { IsIn, IsISO8601, IsObject, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AssignTenantModuleDto {
  @IsUUID()
  moduleId!: string;

  @IsOptional()
  @IsUUID()
  planId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantCode?: string | null;

  @IsOptional()
  @IsISO8601()
  startTime?: string | null;

  @IsOptional()
  @IsISO8601()
  expireTime?: string | null;

  @IsOptional()
  @IsObject()
  featureConfig?: Record<string, unknown>;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}
