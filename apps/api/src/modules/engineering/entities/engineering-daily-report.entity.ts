import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { EngineeringDailyReportStatus, EngineeringWeatherType } from "../domain/engineering-project.enums";

@Entity("biz_engineering_daily_report")
@Index("idx_biz_engineering_daily_report_tenant_deleted", ["tenantId", "isDeleted"])
@Index("idx_biz_engineering_daily_report_org", ["tenantId", "orgId", "isDeleted"])
@Index("idx_biz_engineering_daily_report_project", ["tenantId", "projectId", "isDeleted"])
@Index("idx_biz_engineering_daily_report_plan", ["tenantId", "planId", "isDeleted"])
@Index("idx_biz_engineering_daily_report_date", ["tenantId", "reportDate", "isDeleted"])
@Index("idx_biz_engineering_daily_report_status", ["tenantId", "reportStatus", "isDeleted"])
@Index("idx_biz_engineering_daily_report_contractor", ["tenantId", "contractorOrgId", "isDeleted"])
@Index("idx_biz_engineering_daily_report_supervisor", ["tenantId", "supervisorOrgId", "isDeleted"])
@Index("uk_biz_engineering_daily_report_code", ["tenantId", "reportCode"], { unique: true, where: "is_deleted = false" })
@Index("uk_biz_engineering_daily_report_project_date_contractor", ["tenantId", "projectId", "reportDate", "contractorOrgId"], {
  unique: true,
  where: "is_deleted = false AND contractor_org_id IS NOT NULL"
})
@Index("uk_biz_engineering_daily_report_project_date_null_contractor", ["tenantId", "projectId", "reportDate"], {
  unique: true,
  where: "is_deleted = false AND contractor_org_id IS NULL"
})
export class EngineeringDailyReportEntity extends AuditableEntity {
  @Column({ name: "org_id", type: "uuid", nullable: true })
  orgId!: string | null;

  @Column({ name: "project_id", type: "uuid" })
  projectId!: string;

  @Column({ name: "plan_id", type: "uuid", nullable: true })
  planId!: string | null;

  @Column({ name: "report_code", type: "varchar", length: 64 })
  reportCode!: string;

  @Column({ name: "report_date", type: "date" })
  reportDate!: string;

  @Column({ name: "weather", type: "varchar", length: 32 })
  weather!: EngineeringWeatherType;

  @Column({ name: "temperature", type: "varchar", length: 64, nullable: true })
  temperature!: string | null;

  @Column({ name: "work_content", type: "text" })
  workContent!: string;

  @Column({ name: "completed_work", type: "text", nullable: true })
  completedWork!: string | null;

  @Column({ name: "unfinished_work", type: "text", nullable: true })
  unfinishedWork!: string | null;

  @Column({ name: "tomorrow_plan", type: "text", nullable: true })
  tomorrowPlan!: string | null;

  @Column({ name: "worker_count", type: "integer", default: 0 })
  workerCount!: number;

  @Column({ name: "manager_count", type: "integer", default: 0 })
  managerCount!: number;

  @Column({ name: "machine_summary", type: "text", nullable: true })
  machineSummary!: string | null;

  @Column({ name: "material_summary", type: "text", nullable: true })
  materialSummary!: string | null;

  @Column({ name: "quality_summary", type: "text", nullable: true })
  qualitySummary!: string | null;

  @Column({ name: "safety_summary", type: "text", nullable: true })
  safetySummary!: string | null;

  @Column({ name: "issue_summary", type: "text", nullable: true })
  issueSummary!: string | null;

  @Column({ name: "progress_percent", type: "integer", default: 0 })
  progressPercent!: number;

  @Column({ name: "report_status", type: "varchar", length: 32, default: EngineeringDailyReportStatus.DRAFT })
  reportStatus!: EngineeringDailyReportStatus;

  @Column({ name: "submitted_at", type: "timestamptz", nullable: true })
  submittedAt!: Date | null;

  @Column({ name: "submitted_by", type: "uuid", nullable: true })
  submittedBy!: string | null;

  @Column({ name: "reviewed_at", type: "timestamptz", nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: "reviewed_by", type: "uuid", nullable: true })
  reviewedBy!: string | null;

  @Column({ name: "review_comment", type: "text", nullable: true })
  reviewComment!: string | null;

  @Column({ name: "contractor_org_id", type: "uuid", nullable: true })
  contractorOrgId!: string | null;

  @Column({ name: "supervisor_org_id", type: "uuid", nullable: true })
  supervisorOrgId!: string | null;

  @Column({ name: "attachment_ids", type: "jsonb", nullable: true })
  attachmentIds!: string[] | null;
}
