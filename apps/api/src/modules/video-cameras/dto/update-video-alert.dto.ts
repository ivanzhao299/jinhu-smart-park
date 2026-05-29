import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { VIDEO_ALERT_LEVELS, VIDEO_ALERT_TYPES } from "./create-video-alert.dto";

export class UpdateVideoAlertDto {
  @IsOptional()
  @IsIn(VIDEO_ALERT_TYPES)
  alert_type?: string;

  @IsOptional()
  @IsIn(VIDEO_ALERT_LEVELS)
  alert_level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  snapshot_url?: string | null;

  @IsOptional()
  @IsString()
  video_clip_url?: string | null;

  @IsOptional()
  @IsUUID()
  assigned_to?: string | null;

  @IsOptional()
  @IsString()
  remark?: string | null;
}
