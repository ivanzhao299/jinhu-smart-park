import { IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import type { DataScopeConfig, DataScopeDimension, DataScopeType } from "../entities/data-scope-rule.entity";
import { DATA_SCOPE_DIMENSIONS, DATA_SCOPE_TYPES } from "./create-data-scope-rule.dto";

export class UpdateDataScopeRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  ruleCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ruleName?: string;

  @IsOptional()
  @IsIn(DATA_SCOPE_DIMENSIONS)
  dimension?: DataScopeDimension;

  @IsOptional()
  @IsIn(DATA_SCOPE_TYPES)
  scopeType?: DataScopeType;

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
