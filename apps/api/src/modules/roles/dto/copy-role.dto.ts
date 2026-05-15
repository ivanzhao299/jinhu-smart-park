import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CopyRoleDto {
  @IsString()
  @MaxLength(64)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsIn(["platform", "tenant", "park"])
  roleScope?: string;

  @IsOptional()
  @IsIn(["10", "20", "30", "40", "50", "60", "all", "tenant", "park", "org", "org_and_children", "self", "custom"])
  dataScope?: string;

  @IsOptional()
  @IsObject()
  dataScopeConfig?: Record<string, unknown>;
}
