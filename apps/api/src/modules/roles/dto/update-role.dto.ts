import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 0))
  @IsInt()
  @Min(0)
  sortNo?: number;

  @IsOptional()
  @IsIn(["system", "tenant", "park", "custom", "tenant_external"])
  roleType?: string;

  @IsOptional()
  @IsIn(["platform", "tenant", "park"])
  roleScope?: string;

  @IsOptional()
  @IsIn(["10", "20", "30", "40", "50", "60", "all", "tenant", "park", "org", "org_and_children", "self", "custom"])
  dataScope?: string;

  @IsOptional()
  @IsObject()
  dataScopeConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
