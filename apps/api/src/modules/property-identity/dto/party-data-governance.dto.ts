import { Transform } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }) => String(value ?? "").trim();
const reasonCode = /^[A-Z][A-Z0-9_]{1,63}$/u;

export class CreateConsentFactDto {
  @IsIn(["consent", "legal_obligation"])
  lawful_basis!: "consent" | "legal_obligation";

  @IsIn(["identity_verification", "accommodation_checkin", "housing_move_in", "legal_compliance"])
  processing_purpose!: string;

  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(128)
  notice_version?: string;

  @IsISO8601({ strict: true })
  effective_at!: string;

  @IsIn(["in_person", "web", "mobile", "paper"])
  channel!: string;
}

export class WithdrawConsentFactDto {
  @IsISO8601({ strict: true })
  revoked_at!: string;

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(64) @Matches(reasonCode)
  reason_code!: string;
}

export class CreateDataSubjectRequestDto {
  @IsUUID("4") party_id!: string;
  @IsIn(["erasure", "restrict_processing"])
  request_type!: "erasure" | "restrict_processing";
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(64) @Matches(reasonCode)
  reason_code!: string;
  @IsIn(["in_person", "web", "mobile", "paper"])
  channel!: string;
}

export class DecideDataSubjectRequestDto {
  @IsIn(["approved", "rejected"])
  decision!: "approved" | "rejected";
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(64) @Matches(reasonCode)
  decision_code!: string;
}

export class CompleteDataSubjectRequestDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(64) @Matches(reasonCode)
  completion_code!: string;
}

export class CreateLegalHoldDto {
  @IsUUID("4") party_id!: string;
  @IsOptional() @IsIn(["submission", "snapshot", "identity_photo", "protected_audit"])
  category?: string;
  @IsOptional() @IsUUID("4") object_id?: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(64) @Matches(reasonCode)
  reason_code!: string;
}

export class ReleaseLegalHoldDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(64) @Matches(reasonCode)
  reason_code!: string;
}

export class UpdateRetentionPolicyDto {
  @IsInt() @Min(1) @Max(36500) submission_days!: number;
  @IsIn(["restrict_processing", "anonymize", "delete"]) submission_action!: string;
  @IsInt() @Min(1) @Max(36500) snapshot_days!: number;
  @IsIn(["restrict_processing", "anonymize", "delete"]) snapshot_action!: string;
  @IsInt() @Min(1) @Max(36500) identity_photo_days!: number;
  @IsIn(["restrict_processing", "anonymize", "delete"]) identity_photo_action!: string;
  @IsInt() @Min(1) @Max(36500) protected_audit_days!: number;
  @IsIn(["retain_restricted", "anonymize"]) protected_audit_action!: string;
  @IsIn(["pending_legal_review", "approved"]) legal_review_status!: string;
}

export class ExecuteRetentionDueDto {
  @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
}

export class ClassifyLegacyRetentionDto {
  @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
}
