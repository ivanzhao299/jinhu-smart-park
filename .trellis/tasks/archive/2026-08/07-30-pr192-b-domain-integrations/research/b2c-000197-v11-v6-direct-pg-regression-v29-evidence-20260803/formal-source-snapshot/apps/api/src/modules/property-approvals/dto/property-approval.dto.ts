import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min
} from "class-validator";
import {
  APPROVAL_DECISION_STATUSES,
  APPROVAL_EXECUTION_STATUSES,
  TRACK_B_APPROVAL_EFFECT_MANIFEST,
  type ApprovalDecisionStatus,
  type ApprovalExecutionStatus,
  type ApprovalWithdrawCommand,
  type ApprovalDecisionCommand,
  type TrackBApprovalActionId
} from "@jinhu/shared";

const actionIds = Object.keys(TRACK_B_APPROVAL_EFFECT_MANIFEST) as TrackBApprovalActionId[];
const optionalTrim = ({ value }: { value: unknown }): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
};

export class PropertyApprovalListQueryDto {
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
  @IsIn(APPROVAL_DECISION_STATUSES)
  decisionStatus?: ApprovalDecisionStatus;

  @IsOptional()
  @IsIn(APPROVAL_EXECUTION_STATUSES)
  executionStatus?: ApprovalExecutionStatus;

  @IsOptional()
  @IsIn(actionIds)
  actionId?: TrackBApprovalActionId;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(64)
  sourceType?: string;

  @IsOptional()
  @IsIn(["createdAt", "updatedAt"])
  sort: "createdAt" | "updatedAt" = "createdAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  order: "asc" | "desc" = "desc";
}

export class PropertyApprovalDecisionDto implements ApprovalDecisionCommand {
  @IsString()
  @MaxLength(128)
  @Matches(/^[\x20-\x7e]+$/)
  clientKey!: string;

  @IsIn(["approve", "reject"])
  decision!: "approve" | "reject";

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsUUID()
  stageId!: string;

  @IsInt()
  @Min(1)
  expectedStageVersion!: number;

  @IsInt()
  @Min(1)
  expectedRequestVersion!: number;
}

export class PropertyApprovalWithdrawDto implements ApprovalWithdrawCommand {
  @IsString()
  @MaxLength(128)
  @Matches(/^[\x20-\x7e]+$/)
  clientKey!: string;

  @IsString()
  @MaxLength(1000)
  reason!: string;

  @IsInt()
  @Min(1)
  expectedDecisionVersion!: number;
}

export interface SubmitPropertyApprovalCommand {
  clientKey: string;
  expectedDecisionVersion: number;
}
