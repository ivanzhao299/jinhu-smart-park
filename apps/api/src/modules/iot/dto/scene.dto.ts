import { Transform } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { optionalBoolean, optionalInteger, trimOptional } from "./transformers";
import { normalizeActionArray } from "./create-iot-rule.dto";

export const SCENE_TYPES = [
  "night_patrol",
  "fire_emergency",
  "exhibition_open",
  "exhibition_close",
  "energy_saving_after_work",
  "high_temperature_warning",
  "device_offline_response",
  "warehouse_equipment_stop",
  "park_welcome_display",
  "security_alert_linkage",
  "custom"
] as const;

export const SCENE_TRIGGER_MODES = ["MANUAL", "AUTO", "SCHEDULE"] as const;
export const SCENE_STATUSES = ["ENABLED", "DISABLED"] as const;

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

export class CreateSceneTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  scene_code?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  scene_name!: string;

  @IsString()
  @IsIn(SCENE_TYPES)
  @Transform(({ value }) => trimOptional(value))
  scene_type!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  description?: string;

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => normalizeJsonObject(value))
  trigger_config_json?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Transform(({ value }) => normalizeActionArray(value) ?? [])
  action_config_json?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => optionalBoolean(value))
  is_system?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(SCENE_STATUSES)
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}

export class UpdateSceneTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => trimOptional(value))
  scene_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  scene_name?: string;

  @IsOptional()
  @IsString()
  @IsIn(SCENE_TYPES)
  @Transform(({ value }) => trimOptional(value))
  scene_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  description?: string;

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => normalizeJsonObject(value))
  trigger_config_json?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Transform(({ value }) => normalizeActionArray(value))
  action_config_json?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  @IsIn(SCENE_STATUSES)
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}

export class CreateSceneInstanceDto {
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  template_id?: string;

  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  scene_name!: string;

  @IsString()
  @IsIn(SCENE_TYPES)
  @Transform(({ value }) => trimOptional(value))
  scene_type!: string;

  @IsOptional()
  @IsString()
  @IsIn(SCENE_TRIGGER_MODES)
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  trigger_mode?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  linked_rule_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(SCENE_STATUSES)
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  @Transform(({ value }) => optionalInteger(value))
  priority?: number;

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => normalizeJsonObject(value))
  trigger_config_json?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Transform(({ value }) => normalizeActionArray(value) ?? [])
  action_config_json?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}

export class UpdateSceneInstanceDto {
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  template_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => trimOptional(value))
  scene_name?: string;

  @IsOptional()
  @IsString()
  @IsIn(SCENE_TYPES)
  @Transform(({ value }) => trimOptional(value))
  scene_type?: string;

  @IsOptional()
  @IsString()
  @IsIn(SCENE_TRIGGER_MODES)
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  trigger_mode?: string;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  linked_rule_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(SCENE_STATUSES)
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  @Transform(({ value }) => optionalInteger(value))
  priority?: number;

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => normalizeJsonObject(value))
  trigger_config_json?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  @Transform(({ value }) => normalizeActionArray(value))
  action_config_json?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  remark?: string;
}

export class SceneQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  keyword?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  scene_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  status?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  trigger_mode?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value))
  sort?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => optionalInteger(value))
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Transform(({ value }) => optionalInteger(value))
  page_size?: number;
}

export class SceneExecutionLogQueryDto extends SceneQueryDto {
  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => trimOptional(value))
  scene_instance_id?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  trigger_type?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  execution_status?: string;
}

export class TriggerSceneDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(({ value }) => trimOptional(value)?.toUpperCase())
  trigger_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimOptional(value))
  reason?: string;

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => normalizeJsonObject(value))
  trigger_payload?: Record<string, unknown>;
}
