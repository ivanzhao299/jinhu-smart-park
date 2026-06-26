import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { EngineeringIssueSeverity, EngineeringRectificationStatus } from "../domain/engineering-project.enums";

@Entity("biz_engineering_rectification")
@Index("idx_biz_engineering_rectification_tenant_deleted", ["tenantId", "isDeleted"])
@Index("idx_biz_engineering_rectification_org", ["tenantId", "orgId", "isDeleted"])
@Index("idx_biz_engineering_rectification_project", ["tenantId", "projectId", "isDeleted"])
@Index("idx_biz_engineering_rectification_issue", ["tenantId", "issueId", "isDeleted"])
@Index("idx_biz_engineering_rectification_inspection", ["tenantId", "inspectionId", "isDeleted"])
@Index("idx_biz_engineering_rectification_status", ["tenantId", "status", "isDeleted"])
@Index("idx_biz_engineering_rectification_responsible_user", ["tenantId", "responsibleUserId", "isDeleted"])
@Index("idx_biz_engineering_rectification_responsible_org", ["tenantId", "responsibleOrgId", "isDeleted"])
@Index("idx_biz_engineering_rectification_deadline", ["tenantId", "deadline", "isDeleted"])
@Index("uk_biz_engineering_rectification_code", ["tenantId", "rectificationCode"], { unique: true, where: "is_deleted = false" })
export class EngineeringRectificationEntity extends AuditableEntity {
  @Column({ name: "org_id", type: "uuid", nullable: true })
  orgId!: string | null;

  @Column({ name: "project_id", type: "uuid" })
  projectId!: string;

  @Column({ name: "issue_id", type: "uuid", nullable: true })
  issueId!: string | null;

  @Column({ name: "inspection_id", type: "uuid", nullable: true })
  inspectionId!: string | null;

  @Column({ name: "rectification_code", type: "varchar", length: 64 })
  rectificationCode!: string;

  @Column({ name: "rectification_title", type: "varchar", length: 200 })
  rectificationTitle!: string;

  @Column({ name: "description", type: "text" })
  description!: string;

  @Column({ name: "severity", type: "varchar", length: 32 })
  severity!: EngineeringIssueSeverity;

  @Column({ name: "status", type: "varchar", length: 32, default: EngineeringRectificationStatus.PENDING })
  status!: EngineeringRectificationStatus;

  @Column({ name: "responsible_user_id", type: "uuid", nullable: true })
  responsibleUserId!: string | null;

  @Column({ name: "responsible_org_id", type: "uuid", nullable: true })
  responsibleOrgId!: string | null;

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

  @Column({ name: "deadline", type: "date", nullable: true })
  deadline!: string | null;

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt!: Date | null;

  @Column({ name: "submitted_at", type: "timestamptz", nullable: true })
  submittedAt!: Date | null;

  @Column({ name: "submitted_by", type: "uuid", nullable: true })
  submittedBy!: string | null;

  @Column({ name: "feedback", type: "text", nullable: true })
  feedback!: string | null;

  @Column({ name: "rechecked_at", type: "timestamptz", nullable: true })
  recheckedAt!: Date | null;

  @Column({ name: "rechecked_by", type: "uuid", nullable: true })
  recheckedBy!: string | null;

  @Column({ name: "recheck_comment", type: "text", nullable: true })
  recheckComment!: string | null;

  @Column({ name: "closed_at", type: "timestamptz", nullable: true })
  closedAt!: Date | null;

  @Column({ name: "closed_by", type: "uuid", nullable: true })
  closedBy!: string | null;

  @Column({ name: "attachment_ids", type: "jsonb", nullable: true })
  attachmentIds!: string[] | null;
}
