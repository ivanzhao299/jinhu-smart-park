export const UNIFIED_ACTION_SOURCE_TYPES = [
  "IOT_RULE",
  "IOT_SCENE",
  "IOT_ALERT",
  "VIDEO_ALERT",
  "ENERGY_ALERT",
  "SAFETY",
  "MANUAL"
] as const;

export const UNIFIED_ACTION_TYPES = [
  "CREATE_IOT_ALERT",
  "CREATE_VIDEO_ALERT",
  "CREATE_ENERGY_ALERT",
  "CREATE_SAFETY_HAZARD",
  "CREATE_INSPECTION_TASK",
  "SEND_NOTIFICATION",
  "CONTROL_DEVICE",
  "TRIGGER_BROADCAST",
  "TRIGGER_LED_SCREEN",
  "TRIGGER_ACCESS_CONTROL",
  "TRIGGER_DOOR_OPEN",
  "TRIGGER_DOOR_CLOSE",
  "TRIGGER_DEVICE_STOP",
  "TRIGGER_DEVICE_START",
  "CREATE_WORK_ORDER",
  "CALL_WEBHOOK",
  "NOOP_SIMULATION"
] as const;

export const UNIFIED_ACTION_EXECUTION_STATUSES = ["SUCCESS", "FAILED", "PARTIAL_SUCCESS", "SKIPPED", "SIMULATED"] as const;

export type UnifiedActionSourceType = (typeof UNIFIED_ACTION_SOURCE_TYPES)[number];
export type UnifiedActionType = (typeof UNIFIED_ACTION_TYPES)[number];
export type UnifiedActionExecutionStatus = (typeof UNIFIED_ACTION_EXECUTION_STATUSES)[number];

export interface UnifiedActionExecutionInput {
  source_type: UnifiedActionSourceType;
  source_id?: string | null;
  tenant_id: string;
  park_id: string;
  actor_user_id?: string | null;
  action_type: UnifiedActionType | string;
  action_payload?: Record<string, unknown> | null;
  context_payload?: Record<string, unknown> | null;
}

export interface UnifiedActionExecutionResult {
  action_type: string;
  execution_status: UnifiedActionExecutionStatus;
  result_payload: Record<string, unknown>;
  error_message: string | null;
  executed_at: string;
}
