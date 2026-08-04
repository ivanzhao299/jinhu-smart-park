import { Transform } from "class-transformer";
import {
  IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength
} from "class-validator";
import {
  TRACK_B_APPROVAL_EFFECT_MANIFEST,
  type EventReplayCommand,
  type ApprovalRetryCommand,
  type TrackBApprovalActionId
} from "@jinhu/shared";

const trimOptional = ({ value }: { value: unknown }) => {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
};
const approvalActions = Object.keys(TRACK_B_APPROVAL_EFFECT_MANIFEST) as TrackBApprovalActionId[];

class PageQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @IsIn(["asc", "desc"])
  order: "asc" | "desc" = "desc";
}

export class EventIncidentListQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsIn(["publisher", "consumer"]) failureSide?: string;
  @IsOptional() @Transform(trimOptional) @IsString() @MaxLength(128) consumerName?: string;
  @IsOptional() @IsIn(["active", "replaying", "resolved", "quarantined"]) status?: string;
  @IsOptional() @IsIn(["lastFailedAt", "createdAt"]) sort: "lastFailedAt" | "createdAt" = "lastFailedAt";
}

export class EventReplayDto implements EventReplayCommand {
  @IsString() @MinLength(1) @MaxLength(128) @Matches(/^[\x20-\x7e]+$/) clientKey!: string;
  @IsString() @MinLength(1) @MaxLength(128) incidentId!: string;
  @IsString() @MinLength(1) @MaxLength(1000) @Matches(/\S/) reason!: string;
  @IsInt() @Min(1) expectedDlqVersion!: number;
}

export class ApprovalIncidentRetryDto implements ApprovalRetryCommand {
  @IsString() @MinLength(1) @MaxLength(128) @Matches(/^[\x20-\x7e]+$/) clientKey!: string;
  @IsString() @MinLength(1) @MaxLength(128) incidentId!: string;
  @IsString() @MinLength(1) @MaxLength(1000) @Matches(/\S/) reason!: string;
  @IsInt() @Min(1) expectedExecutionVersion!: number;
}

export class ApprovalIncidentListQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(approvalActions) actionId?: TrackBApprovalActionId;
  @IsOptional() @Transform(trimOptional) @IsString() @MaxLength(64) sourceType?: string;
  @IsOptional()
  @IsIn(["infraExhaustedAt", "lastRetryAt", "updatedAt"])
  sort: "infraExhaustedAt" | "lastRetryAt" | "updatedAt" = "infraExhaustedAt";
}
