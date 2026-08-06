import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf
} from "class-validator";
import {
  IDENTITY_SUBMISSION_STATUSES,
  type IdentitySubmissionStatus
} from "@jinhu/shared";

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

const nullableTrim = ({ value }: { value: unknown }): unknown => {
  if (value === null || value === undefined) return value;
  const normalized = String(value).trim();
  return normalized || null;
};

export class IdentityClientKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/^[\x20-\x7e]+$/)
  clientKey!: string;
}

export class CreateIdentityDraftDto extends IdentityClientKeyDto {
  @IsUUID("4")
  partyId!: string;

  @IsInt()
  @Min(0)
  expectedIdentityVersion!: number;

  @ValidateIf((value: CreateIdentityDraftDto) =>
    value.supersedesSubmissionId !== undefined
    || value.expectedSupersededStatus !== undefined
    || value.expectedSupersededVersion !== undefined)
  @IsUUID("4")
  supersedesSubmissionId?: string;

  @ValidateIf((value: CreateIdentityDraftDto) =>
    value.supersedesSubmissionId !== undefined
    || value.expectedSupersededStatus !== undefined
    || value.expectedSupersededVersion !== undefined)
  @IsIn(["rejected", "withdrawn", "verified"])
  expectedSupersededStatus?: "rejected" | "withdrawn" | "verified";

  @ValidateIf((value: CreateIdentityDraftDto) =>
    value.supersedesSubmissionId !== undefined
    || value.expectedSupersededStatus !== undefined
    || value.expectedSupersededVersion !== undefined)
  @IsInt()
  @Min(1)
  expectedSupersededVersion?: number;
}

export class UpdateIdentityDraftDto extends IdentityClientKeyDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsIn(["id_card", "passport", null])
  documentType!: "id_card" | "passport" | null;

  @Transform(nullableTrim)
  @ValidateIf((_value, input: unknown) => input !== null)
  @IsString()
  @MaxLength(128)
  identityNumber!: string | null;

  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  pendingFileIds!: string[];
}

export class SubmitIdentityDto extends IdentityClientKeyDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ClaimIdentityDto extends SubmitIdentityDto {
  @IsInt()
  @Min(0)
  expectedAssignmentVersion!: number;
}

export class ReassignIdentityDto extends ClaimIdentityDto {
  @IsOptional()
  @IsUUID("4")
  assignedVerifierId!: string | null;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class DecideIdentityDto extends ClaimIdentityDto {
  @IsIn(["verified", "rejected"])
  decision!: "verified" | "rejected";

  @Transform(nullableTrim)
  @ValidateIf((value: DecideIdentityDto) => value.decision === "rejected" || value.reason != null)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}

export class WithdrawIdentityDto extends SubmitIdentityDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class IdentitySubmissionListQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @IsIn(IDENTITY_SUBMISSION_STATUSES)
  status?: IdentitySubmissionStatus;

  @IsOptional()
  @IsUUID("4")
  partyId?: string;

  @IsOptional()
  @IsUUID("4")
  verificationQueueId?: string;

  @IsOptional()
  @IsIn(["mine", "unassigned", "any"])
  assignment: "mine" | "unassigned" | "any" = "any";

  @IsOptional()
  @IsString()
  submittedFrom?: string;

  @IsOptional()
  @IsString()
  submittedTo?: string;

  @IsOptional()
  @IsIn(["createTime", "submittedAt", "decidedAt", "updateTime"])
  sort?: "createTime" | "submittedAt" | "decidedAt" | "updateTime";

  @IsOptional()
  @IsIn(["asc", "desc"])
  order: "asc" | "desc" = "desc";
}

export class IdentityAuditListQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;

  @IsOptional()
  @IsIn(["occurredAt"])
  sort = "occurredAt" as const;

  @IsOptional()
  @IsIn(["asc", "desc"])
  order: "asc" | "desc" = "desc";
}
