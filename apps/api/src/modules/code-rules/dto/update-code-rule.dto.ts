import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { CODE_RULE_ENTITY_TYPES, type CodeRuleEntityType } from "./create-code-rule.dto";

export class UpdateCodeRuleDto {
  @IsOptional()
  @IsIn(CODE_RULE_ENTITY_TYPES)
  entityType?: CodeRuleEntityType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ruleCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ruleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetModule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetEntity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  prefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  pattern?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  datePattern?: string | null;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(12)
  sequenceLength?: number;

  @IsOptional()
  @IsIn(["none", "daily", "monthly", "yearly"])
  resetStrategy?: string;

  @IsOptional()
  @IsIn(["none", "daily", "monthly", "yearly"])
  resetPolicy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  separator?: string;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string | null;
}
