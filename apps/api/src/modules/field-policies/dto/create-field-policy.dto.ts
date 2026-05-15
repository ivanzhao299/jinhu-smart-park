import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { FieldPolicyType } from "../entities/field-policy.entity";

export const FIELD_POLICY_TYPES: FieldPolicyType[] = ["visible", "masked", "hidden", "readonly", "editable"];
export const FIELD_MASK_RULES = ["mobile", "id_card", "bank_account", "amount", "custom", "file_name", "default"] as const;

export class CreateFieldPolicyDto {
  @IsString()
  @MaxLength(64)
  module!: string;

  @IsString()
  @MaxLength(64)
  entity!: string;

  @IsString()
  @MaxLength(128)
  fieldKey!: string;

  @IsString()
  @MaxLength(100)
  fieldName!: string;

  @IsIn(FIELD_POLICY_TYPES)
  policyType!: FieldPolicyType;

  @IsOptional()
  @IsIn(FIELD_MASK_RULES)
  maskRule?: string;

  @IsOptional()
  @IsIn(["enabled", "disabled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
