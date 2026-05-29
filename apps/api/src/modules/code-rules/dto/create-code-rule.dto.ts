import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export const CODE_RULE_ENTITY_TYPES = [
  "park",
  "building",
  "floor",
  "room",
  "unit",
  "zone",
  "asset",
  "device",
  "camera",
  "iot_point",
  "iot_gateway",
  "iot_device",
  "iot_metric",
  "iot_alert",
  "iot_alert_rule",
  "robot",
  "cleaning_robot",
  "inspection_robot",
  "workorder",
  "workorder_log",
  "safety_inspect_point",
  "safety_inspect_template",
  "safety_inspect_plan",
  "safety_inspect_task",
  "safety_hazard",
  "safety_hazard_log",
  "leasing_lead",
  "contract",
  "contract_change",
  "renewal_contract",
  "checkout",
  "refund",
  "bill",
  "receivable",
  "payment",
  "invoice",
  "waiver",
  "energy_billing_cycle"
] as const;

export type CodeRuleEntityType = (typeof CODE_RULE_ENTITY_TYPES)[number];

export class CreateCodeRuleDto {
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

  @IsString()
  @MaxLength(32)
  prefix!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  pattern?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  datePattern?: string;

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
  remark?: string;
}
