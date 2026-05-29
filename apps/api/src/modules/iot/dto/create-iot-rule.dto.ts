import { Transform } from "class-transformer";
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { UNIFIED_ACTION_TYPES } from "../unified-action-executor.types";
import { optionalInteger, trimOptional } from "./transformers";

export const IOT_RULE_TYPES = ["METRIC", "STATUS", "ALERT", "SCHEDULE", "MANUAL"] as const;
export const IOT_RULE_TRIGGER_SCOPES = ["DEVICE", "DEVICE_TYPE", "AREA", "PARK"] as const;
export const IOT_RULE_STATUSES = ["ENABLED", "DISABLED"] as const;
export const IOT_RULE_ACTION_TYPES = UNIFIED_ACTION_TYPES;

export type IotRuleActionType = (typeof IOT_RULE_ACTION_TYPES)[number];
export type IotRuleActionConfig = Record<string, unknown> & { type?: IotRuleActionType };

function normalizeJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function normalizeActionArray(value: unknown): IotRuleActionConfig[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsedValue = typeof value === "string" ? safeJsonParse(value) : value;
  if (Array.isArray(parsedValue)) {
    return parsedValue.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as IotRuleActionConfig[];
  }
  if (parsedValue && typeof parsedValue === "object") {
    return [parsedValue as IotRuleActionConfig];
  }
  return undefined;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export class CreateIotRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  rule_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  code?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  rule_name!: string;

  @IsString()
  @IsIn(IOT_RULE_TYPES)
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  rule_type!: (typeof IOT_RULE_TYPES)[number];

  @IsOptional()
  @IsString()
  @IsIn(IOT_RULE_TRIGGER_SCOPES)
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  trigger_scope?: (typeof IOT_RULE_TRIGGER_SCOPES)[number];

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  device_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  device_type?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  area_id?: string;

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => normalizeJsonObject(value))
  condition_json?: Record<string, unknown>;

  @IsArray()
  @IsObject({ each: true })
  @Transform(({ value }) => normalizeActionArray(value) ?? [])
  action_json!: IotRuleActionConfig[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  @Transform(({ value }) => optionalInteger(value))
  priority?: number;

  @IsOptional()
  @IsString()
  @IsIn(IOT_RULE_STATUSES)
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  status?: (typeof IOT_RULE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}
