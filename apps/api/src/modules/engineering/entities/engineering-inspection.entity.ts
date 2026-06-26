import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { EngineeringInspectionStatus, EngineeringInspectionType } from "../domain/engineering-project.enums";

@Entity("biz_engineering_inspection")
@Index("idx_biz_engineering_inspection_tenant_deleted", ["tenantId", "isDeleted"])
@Index("idx_biz_engineering_inspection_org", ["tenantId", "orgId", "isDeleted"])
@Index("idx_biz_engineering_inspection_project", ["tenantId", "projectId", "isDeleted"])
@Index("idx_biz_engineering_inspection_plan", ["tenantId", "planId", "isDeleted"])
@Index("idx_biz_engineering_inspection_daily_report", ["tenantId", "dailyReportId", "isDeleted"])
@Index("idx_biz_engineering_inspection_date", ["tenantId", "inspectionDate", "isDeleted"])
@Index("idx_biz_engineering_inspection_status", ["tenantId", "inspectionStatus", "isDeleted"])
@Index("idx_biz_engineering_inspection_type", ["tenantId", "inspectionType", "isDeleted"])
@Index("idx_biz_engineering_inspection_inspector", ["tenantId", "inspectorUserId", "isDeleted"])
@Index("uk_biz_engineering_inspection_code", ["tenantId", "inspectionCode"], { unique: true, where: "is_deleted = false" })
export class EngineeringInspectionEntity extends AuditableEntity {
  @Column({ name: "org_id", type: "uuid", nullable: true })
  orgId!: string | null;

  @Column({ name: "project_id", type: "uuid" })
  projectId!: string;

  @Column({ name: "plan_id", type: "uuid", nullable: true })
  planId!: string | null;

  @Column({ name: "daily_report_id", type: "uuid", nullable: true })
  dailyReportId!: string | null;

  @Column({ name: "inspection_code", type: "varchar", length: 64 })
  inspectionCode!: string;

  @Column({ name: "inspection_title", type: "varchar", length: 200 })
  inspectionTitle!: string;

  @Column({ name: "inspection_type", type: "varchar", length: 32 })
  inspectionType!: EngineeringInspectionType;

  @Column({ name: "inspection_date", type: "date" })
  inspectionDate!: string;

  @Column({ name: "inspector_user_id", type: "uuid", nullable: true })
  inspectorUserId!: string | null;

  @Column({ name: "inspector_org_id", type: "uuid", nullable: true })
  inspectorOrgId!: string | null;

  @Column({ name: "contractor_org_id", type: "uuid", nullable: true })
  contractorOrgId!: string | null;

  @Column({ name: "supervisor_org_id", type: "uuid", nullable: true })
  supervisorOrgId!: string | null;

  @Column({ name: "location_text", type: "varchar", length: 300, nullable: true })
  locationText!: string | null;

  @Column({ name: "building_id", type: "uuid", nullable: true })
  buildingId!: string | null;

  @Column({ name: "floor_id", type: "uuid", nullable: true })
  floorId!: string | null;

  @Column({ name: "space_id", type: "uuid", nullable: true })
  spaceId!: string | null;

  @Column({ name: "inspection_status", type: "varchar", length: 32, default: EngineeringInspectionStatus.DRAFT })
  inspectionStatus!: EngineeringInspectionStatus;

  @Column({ name: "summary", type: "text", nullable: true })
  summary!: string | null;

  @Column({ name: "overall_result", type: "varchar", length: 64, nullable: true })
  overallResult!: string | null;

  @Column({ name: "issue_count", type: "integer", default: 0 })
  issueCount!: number;

  @Column({ name: "critical_issue_count", type: "integer", default: 0 })
  criticalIssueCount!: number;

  @Column({ name: "attachment_ids", type: "jsonb", nullable: true })
  attachmentIds!: string[] | null;

  @Column({ name: "submitted_at", type: "timestamptz", nullable: true })
  submittedAt!: Date | null;

  @Column({ name: "submitted_by", type: "uuid", nullable: true })
  submittedBy!: string | null;
}
