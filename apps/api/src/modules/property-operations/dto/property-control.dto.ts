import { Transform } from "class-transformer";
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from "class-validator";
import {
  APPROVAL_DECISION_STATUSES,
  APPROVAL_EXECUTION_STATUSES,
  PROPERTY_OPERATING_MODES,
  PROPERTY_OPERATING_STATUSES,
  type ApprovalDecisionStatus,
  type ApprovalExecutionStatus,
  type PropertyOperatingMode,
  type PropertyOperatingStatus
} from "@jinhu/shared";

export const PROPERTY_CONTROL_BLOCKER_CODES = [
  "commercial-active",
  "homestay-active",
  "housing-active",
  "occupancy-incompatible",
  "operations-blocker",
  "checkout-pending",
  "workorder-open",
  "receivable-unsettled"
] as const;

const optionalTrim = ({ value }: { value: unknown }): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const result = String(value).trim();
  return result || undefined;
};

abstract class PropertyControlPageQueryDto {
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

export class PropertyOperationListQueryDto extends PropertyControlPageQueryDto {
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsUUID()
  buildingId?: string;

  @IsOptional()
  @IsIn(PROPERTY_OPERATING_MODES)
  configuredMode?: PropertyOperatingMode;

  @IsOptional()
  @IsIn(PROPERTY_OPERATING_STATUSES)
  operationStatus?: PropertyOperatingStatus;

  @IsOptional()
  @IsIn(PROPERTY_CONTROL_BLOCKER_CODES)
  blockerCode?: (typeof PROPERTY_CONTROL_BLOCKER_CODES)[number];

  @IsOptional()
  @IsIn(["unitCode", "configuredMode", "updateTime"])
  sort: "unitCode" | "configuredMode" | "updateTime" = "updateTime";
}

export class PropertyModeTransitionUnitListQueryDto extends PropertyControlPageQueryDto {
  @IsOptional()
  @IsIn(APPROVAL_DECISION_STATUSES)
  decisionStatus?: ApprovalDecisionStatus;

  @IsOptional()
  @IsIn(APPROVAL_EXECUTION_STATUSES)
  executionStatus?: ApprovalExecutionStatus;
}

export class PropertyModeTransitionListQueryDto extends PropertyControlPageQueryDto {
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsIn(PROPERTY_OPERATING_MODES)
  fromMode?: PropertyOperatingMode;

  @IsOptional()
  @IsIn(PROPERTY_OPERATING_MODES)
  toMode?: PropertyOperatingMode;

  @IsOptional()
  @IsISO8601({ strict: true })
  startFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endTo?: string;

  @IsOptional()
  @IsIn(APPROVAL_DECISION_STATUSES)
  decisionStatus?: ApprovalDecisionStatus;

  @IsOptional()
  @IsIn(APPROVAL_EXECUTION_STATUSES)
  executionStatus?: ApprovalExecutionStatus;

  @IsOptional()
  @IsIn(["createTime", "decisionTime", "executionTime"])
  sort: "createTime" | "decisionTime" | "executionTime" = "createTime";
}
