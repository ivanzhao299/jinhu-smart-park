import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export const VIDEO_ALERT_TYPES = [
  "CAMERA_OFFLINE",
  "VIDEO_LOST",
  "STORAGE_EXCEPTION",
  "DEVICE_DISABLED",
  "PLATFORM_AUTH_FAILED",
  "ABNORMAL_DISCONNECT",
  "MANUAL_REPORT",
  "AI_INTRUSION",
  "AI_FIRE",
  "AI_CROWD",
  "AI_BLOCKED_PASSAGE"
] as const;

export const VIDEO_ALERT_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const VIDEO_ALERT_SOURCES = ["DEVICE", "PLATFORM", "MANUAL", "AI_ANALYSIS"] as const;

export class CreateVideoAlertDto {
  @IsUUID()
  camera_id!: string;

  @IsIn(VIDEO_ALERT_TYPES)
  alert_type!: string;

  @IsIn(VIDEO_ALERT_LEVELS)
  alert_level!: string;

  @IsOptional()
  @IsIn(VIDEO_ALERT_SOURCES)
  alert_source?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  snapshot_url?: string;

  @IsOptional()
  @IsString()
  video_clip_url?: string;

  @IsOptional()
  @IsString()
  triggered_at?: string;

  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
