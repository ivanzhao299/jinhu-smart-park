import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

export type AdminIssueStatus = "OPEN" | "TRIAGED" | "APPROVED" | "IN_PROGRESS" | "VERIFIED" | "RELEASED" | "CLOSED" | "REJECTED";
export type AdminIssueRunnerStatus = "NONE" | "READY" | "CLAIMED" | "RUNNING" | "WAITING_REVIEW" | "SUCCEEDED" | "FAILED" | "HOLD";

@Entity({ name: "admin_issue_reports" })
@Index("idx_admin_issue_scope_status", ["tenantId", "parkId", "status"])
@Index("idx_admin_issue_runner_ready", ["tenantId", "parkId", "runnerStatus"])
export class AdminIssueReportEntity extends AuditableEntity {
  @Index("uq_admin_issue_no", { unique: true })
  @Column({ name: "issue_no", type: "varchar", length: 40 })
  issueNo!: string;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "varchar", length: 16, default: "MEDIUM" })
  severity!: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  @Column({ type: "varchar", length: 40, default: "OPEN" })
  status!: AdminIssueStatus;

  @Column({ name: "runner_status", type: "varchar", length: 40, default: "NONE" })
  runnerStatus!: AdminIssueRunnerStatus;

  @Column({ name: "module_code", type: "varchar", length: 80, nullable: true })
  moduleCode!: string | null;

  @Column({ type: "varchar", length: 500 })
  route!: string;

  @Column({ type: "varchar", length: 1000, nullable: true })
  url!: string | null;

  @Column({ name: "reporter_id", type: "uuid" })
  reporterId!: string;

  @Column({ name: "reporter_name", type: "varchar", length: 160 })
  reporterName!: string;

  @Column({ name: "client_context", type: "jsonb", default: () => "'{}'::jsonb" })
  clientContext!: Record<string, unknown>;

  @Column({ name: "acceptance_criteria", type: "text", nullable: true })
  acceptanceCriteria!: string | null;

  @Column({ name: "approved_by", type: "uuid", nullable: true })
  approvedBy!: string | null;

  @Column({ name: "approved_at", type: "timestamptz", nullable: true })
  approvedAt!: Date | null;

  @Column({ name: "runner_id", type: "varchar", length: 128, nullable: true })
  runnerId!: string | null;

  @Column({ name: "lease_token", type: "uuid", nullable: true })
  leaseToken!: string | null;

  @Column({ name: "lease_expires_at", type: "timestamptz", nullable: true })
  leaseExpiresAt!: Date | null;

  @Column({ name: "implementation_commit", type: "varchar", length: 64, nullable: true })
  implementationCommit!: string | null;

  @Column({ name: "changed_files", type: "jsonb", default: () => "'[]'::jsonb" })
  changedFiles!: string[];

  @Column({ name: "validation_evidence", type: "jsonb", default: () => "'{}'::jsonb" })
  validationEvidence!: Record<string, unknown>;

  @Column({ name: "release_evidence", type: "jsonb", default: () => "'{}'::jsonb" })
  releaseEvidence!: Record<string, unknown>;

  @Column({ name: "resolution_summary", type: "text", nullable: true })
  resolutionSummary!: string | null;
}
