import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { EngineeringAcceptanceStatus, EngineeringAcceptanceType, EngineeringRiskLevel } from "../domain/engineering-project.enums";

@Entity("biz_engineering_acceptance")
@Index("idx_biz_engineering_acceptance_tenant_deleted", ["tenantId", "isDeleted"])
@Index("idx_biz_engineering_acceptance_org", ["tenantId", "orgId", "isDeleted"])
@Index("idx_biz_engineering_acceptance_project", ["tenantId", "projectId", "isDeleted"])
@Index("idx_biz_engineering_acceptance_plan", ["tenantId", "planId", "isDeleted"])
@Index("idx_biz_engineering_acceptance_type", ["tenantId", "acceptanceType", "isDeleted"])
@Index("idx_biz_engineering_acceptance_status", ["tenantId", "acceptanceStatus", "isDeleted"])
@Index("idx_biz_engineering_acceptance_date", ["tenantId", "plannedAcceptanceDate", "isDeleted"])
@Index("idx_biz_engineering_acceptance_responsible", ["tenantId", "responsibleUserId", "isDeleted"])
@Index("uk_biz_engineering_acceptance_code", ["tenantId", "acceptanceCode"], { unique: true, where: "is_deleted = false" })
export class EngineeringAcceptanceEntity extends AuditableEntity {
  @Column({ name: "org_id", type: "uuid", nullable: true })
  orgId!: string | null;

  @Column({ name: "project_id", type: "uuid" })
  projectId!: string;

  @Column({ name: "plan_id", type: "uuid", nullable: true })
  planId!: string | null;

  @Column({ name: "acceptance_code", type: "varchar", length: 64 })
  acceptanceCode!: string;

  @Column({ name: "acceptance_name", type: "varchar", length: 200 })
  acceptanceName!: string;

  @Column({ name: "acceptance_type", type: "varchar", length: 40 })
  acceptanceType!: EngineeringAcceptanceType;

  @Column({ name: "acceptance_status", type: "varchar", length: 40, default: EngineeringAcceptanceStatus.DRAFT })
  acceptanceStatus!: EngineeringAcceptanceStatus;

  @Column({ name: "risk_level", type: "varchar", length: 32, default: EngineeringRiskLevel.MEDIUM })
  riskLevel!: EngineeringRiskLevel;

  @Column({ name: "planned_acceptance_date", type: "date" })
  plannedAcceptanceDate!: string;

  @Column({ name: "actual_acceptance_date", type: "date", nullable: true })
  actualAcceptanceDate!: string | null;

  @Column({ name: "description", type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "acceptance_scope", type: "text", nullable: true })
  acceptanceScope!: string | null;

  @Column({ name: "acceptance_criteria", type: "text", nullable: true })
  acceptanceCriteria!: string | null;

  @Column({ name: "result_summary", type: "text", nullable: true })
  resultSummary!: string | null;

  @Column({ name: "review_comment", type: "text", nullable: true })
  reviewComment!: string | null;

  @Column({ name: "responsible_user_id", type: "uuid", nullable: true })
  responsibleUserId!: string | null;

  @Column({ name: "acceptance_org_id", type: "uuid", nullable: true })
  acceptanceOrgId!: string | null;

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

  @Column({ name: "submitted_at", type: "timestamptz", nullable: true })
  submittedAt!: Date | null;

  @Column({ name: "submitted_by", type: "uuid", nullable: true })
  submittedBy!: string | null;

  @Column({ name: "reviewed_at", type: "timestamptz", nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: "reviewed_by", type: "uuid", nullable: true })
  reviewedBy!: string | null;

  @Column({ name: "closed_at", type: "timestamptz", nullable: true })
  closedAt!: Date | null;

  @Column({ name: "closed_by", type: "uuid", nullable: true })
  closedBy!: string | null;

  @Column({ name: "workflow_instance_id", type: "uuid", nullable: true })
  workflowInstanceId!: string | null;

  @Column({ name: "attachment_ids", type: "jsonb", nullable: true })
  attachmentIds!: string[] | null;
}
