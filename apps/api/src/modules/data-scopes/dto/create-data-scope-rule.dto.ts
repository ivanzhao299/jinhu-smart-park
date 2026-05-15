import { IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import type { DataScopeConfig, DataScopeDimension, DataScopeType } from "../entities/data-scope-rule.entity";

export const DATA_SCOPE_DIMENSIONS: DataScopeDimension[] = [
  "tenant",
  "park",
  "org",
  "building",
  "floor",
  "unit",
  "tenant_company",
  "customer_owner",
  "contract_owner",
  "workorder_handler"
];

export const DATA_SCOPE_TYPES: DataScopeType[] = ["all", "tenant", "park", "org", "org_and_children", "self", "assigned", "custom"];

export class CreateDataScopeRuleDto {
  @IsString()
  @MaxLength(128)
  ruleCode!: string;

  @IsString()
  @MaxLength(100)
  ruleName!: string;

  @IsIn(DATA_SCOPE_DIMENSIONS)
  dimension!: DataScopeDimension;

  @IsIn(DATA_SCOPE_TYPES)
  scopeType!: DataScopeType;

  @IsOptional()
  @IsObject()
  scopeConfig?: DataScopeConfig;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
