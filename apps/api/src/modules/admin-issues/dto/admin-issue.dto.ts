import { Transform, Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";

const trim = ({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value;

export class CreateAdminIssueDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(20_000) description!: string;
  @IsIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"]) severity!: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500) route!: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(1000) url?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(80) module_code?: string;
  @IsOptional() @IsObject() client_context?: Record<string, unknown>;
}

export class AdminIssueQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 20;
  @IsOptional() @IsIn(["OPEN", "TRIAGED", "APPROVED", "IN_PROGRESS", "VERIFIED", "RELEASED", "CLOSED", "REJECTED"]) status?: string;
}

export class TriageAdminIssueDto {
  @IsIn(["TRIAGED", "APPROVED", "REJECTED"]) status!: "TRIAGED" | "APPROVED" | "REJECTED";
  @Transform(trim) @IsOptional() @IsString() @MaxLength(80) module_code?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(20_000) acceptance_criteria?: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ClaimAdminIssueDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(128) runner_id!: string;
}

export class AdminIssueRunnerResultDto {
  @IsUUID() lease_token!: string;
  @IsIn(["WAITING_REVIEW", "SUCCEEDED", "FAILED", "HOLD"]) runner_status!: "WAITING_REVIEW" | "SUCCEEDED" | "FAILED" | "HOLD";
  @Transform(trim) @IsOptional() @IsString() @Matches(/^[0-9a-f]{7,64}$/i) implementation_commit?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) changed_files?: string[];
  @IsOptional() @IsObject() validation_evidence?: Record<string, unknown>;
  @IsOptional() @IsObject() release_evidence?: Record<string, unknown>;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(20_000) summary!: string;
}
