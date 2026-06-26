import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import {
  EngineeringIssueSeverity,
  EngineeringIssueSourceType,
  EngineeringIssueStatus,
  EngineeringIssueType
} from "../domain/engineering-project.enums";

@Entity("biz_engineering_issue")
@Index("idx_biz_engineering_issue_tenant_deleted", ["tenantId", "isDeleted"])
@Index("idx_biz_engineering_issue_org", ["tenantId", "orgId", "isDeleted"])
@Index("idx_biz_engineering_issue_project", ["tenantId", "projectId", "isDeleted"])
@Index("idx_biz_engineering_issue_inspection", ["tenantId", "inspectionId", "isDeleted"])
@Index("idx_biz_engineering_issue_plan", ["tenantId", "planId", "isDeleted"])
@Index("idx_biz_engineering_issue_daily_report", ["tenantId", "dailyReportId", "isDeleted"])
@Index("idx_biz_engineering_issue_type", ["tenantId", "issueType", "isDeleted"])
@Index("idx_biz_engineering_issue_severity", ["tenantId", "severity", "isDeleted"])
@Index("idx_biz_engineering_issue_status", ["tenantId", "issueStatus", "isDeleted"])
@Index("idx_biz_engineering_issue_responsible_user", ["tenantId", "responsibleUserId", "isDeleted"])
@Index("idx_biz_engineering_issue_responsible_org", ["tenantId", "responsibleOrgId", "isDeleted"])
@Index("idx_biz_engineering_issue_deadline", ["tenantId", "deadline", "isDeleted"])
@Index("uk_biz_engineering_issue_code", ["tenantId", "issueCode"], { unique: true, where: "is_deleted = false" })
export class EngineeringIssueEntity extends AuditableEntity {
  @Column({ name: "org_id", type: "uuid", nullable: true })
  orgId!: string | null;

  @Column({ name: "project_id", type: "uuid" })
  projectId!: string;

  @Column({ name: "inspection_id", type: "uuid", nullable: true })
  inspectionId!: string | null;

  @Column({ name: "plan_id", type: "uuid", nullable: true })
  planId!: string | null;

  @Column({ name: "daily_report_id", type: "uuid", nullable: true })
  dailyReportId!: string | null;

  @Column({ name: "issue_code", type: "varchar", length: 64 })
  issueCode!: string;

  @Column({ name: "issue_title", type: "varchar", length: 200 })
  issueTitle!: string;

  @Column({ name: "issue_type", type: "varchar", length: 32 })
  issueType!: EngineeringIssueType;

  @Column({ name: "severity", type: "varchar", length: 32 })
  severity!: EngineeringIssueSeverity;

  @Column({ name: "issue_status", type: "varchar", length: 32, default: EngineeringIssueStatus.OPEN })
  issueStatus!: EngineeringIssueStatus;

  @Column({ name: "description", type: "text" })
  description!: string;

  @Column({ name: "location_text", type: "varchar", length: 300, nullable: true })
  locationText!: string | null;

  @Column({ name: "building_id", type: "uuid", nullable: true })
  buildingId!: string | null;

  @Column({ name: "floor_id", type: "uuid", nullable: true })
  floorId!: string | null;

  @Column({ name: "space_id", type: "uuid", nullable: true })
  spaceId!: string | null;

  @Column({ name: "responsible_user_id", type: "uuid", nullable: true })
  responsibleUserId!: string | null;

  @Column({ name: "responsible_org_id", type: "uuid", nullable: true })
  responsibleOrgId!: string | null;

  @Column({ name: "contractor_org_id", type: "uuid", nullable: true })
  contractorOrgId!: string | null;

  @Column({ name: "supervisor_org_id", type: "uuid", nullable: true })
  supervisorOrgId!: string | null;

  @Column({ name: "discovered_at", type: "timestamptz" })
  discoveredAt!: Date;

  @Column({ name: "deadline", type: "date", nullable: true })
  deadline!: string | null;

  @Column({ name: "rectification_id", type: "uuid", nullable: true })
  rectificationId!: string | null;

  @Column({ name: "source_type", type: "varchar", length: 32, default: EngineeringIssueSourceType.INSPECTION })
  sourceType!: EngineeringIssueSourceType;

  @Column({ name: "source_id", type: "uuid", nullable: true })
  sourceId!: string | null;

  @Column({ name: "attachment_ids", type: "jsonb", nullable: true })
  attachmentIds!: string[] | null;

  @Column({ name: "closed_at", type: "timestamptz", nullable: true })
  closedAt!: Date | null;

  @Column({ name: "closed_by", type: "uuid", nullable: true })
  closedBy!: string | null;
}
