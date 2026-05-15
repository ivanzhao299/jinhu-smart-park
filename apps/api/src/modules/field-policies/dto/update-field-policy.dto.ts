import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { FieldPolicyType } from "../entities/field-policy.entity";
import { FIELD_MASK_RULES, FIELD_POLICY_TYPES } from "./create-field-policy.dto";

export class UpdateFieldPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  module?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  fieldKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fieldName?: string;

  @IsOptional()
  @IsIn(FIELD_POLICY_TYPES)
  policyType?: FieldPolicyType;

  @IsOptional()
  @IsIn(FIELD_MASK_RULES)
  maskRule?: string | null;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
