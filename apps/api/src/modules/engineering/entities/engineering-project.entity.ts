import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import {
  EngineeringAssetStatus,
  EngineeringFinanceStatus,
  EngineeringProjectLevel,
  EngineeringProjectStatus,
  EngineeringProjectType,
  EngineeringRiskLevel,
  EngineeringTransferStatus
} from "../domain/engineering-project.enums";

@Entity("biz_engineering_project")
@Index("idx_biz_engineering_project_tenant_deleted", ["tenantId", "isDeleted"])
@Index("idx_biz_engineering_project_org", ["tenantId", "orgId", "isDeleted"])
@Index("idx_biz_engineering_project_park", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_engineering_project_type", ["tenantId", "projectType", "isDeleted"])
@Index("idx_biz_engineering_project_status", ["tenantId", "status", "isDeleted"])
@Index("idx_biz_engineering_project_manager", ["tenantId", "projectManagerId", "isDeleted"])
@Index("idx_biz_engineering_project_contractor", ["tenantId", "contractorOrgId", "isDeleted"])
@Index("idx_biz_engineering_project_planned_start", ["tenantId", "plannedStartDate", "isDeleted"])
@Index("idx_biz_engineering_project_created", ["tenantId", "createTime", "isDeleted"])
@Index("uk_biz_engineering_project_code", ["tenantId", "projectCode"], { unique: true, where: "is_deleted = false" })
export class EngineeringProjectEntity extends AuditableEntity {
  @Column({ name: "org_id", type: "uuid", nullable: true })
  orgId!: string | null;

  @Column({ name: "project_code", type: "varchar", length: 64 })
  projectCode!: string;

  @Column({ name: "project_name", type: "varchar", length: 200 })
  projectName!: string;

  @Column({ name: "project_type", type: "varchar", length: 64 })
  projectType!: EngineeringProjectType;

  @Column({ name: "project_level", type: "varchar", length: 32, default: EngineeringProjectLevel.NORMAL })
  projectLevel!: EngineeringProjectLevel;

  @Column({ name: "project_source", type: "varchar", length: 64, nullable: true })
  projectSource!: string | null;

  @Column({ name: "description", type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "location_text", type: "varchar", length: 300, nullable: true })
  locationText!: string | null;

  @Column({ name: "building_id", type: "uuid", nullable: true })
  buildingId!: string | null;

  @Column({ name: "floor_id", type: "uuid", nullable: true })
  floorId!: string | null;

  @Column({ name: "space_id", type: "uuid", nullable: true })
  spaceId!: string | null;

  @Column({ name: "planned_start_date", type: "date", nullable: true })
  plannedStartDate!: string | null;

  @Column({ name: "planned_end_date", type: "date", nullable: true })
  plannedEndDate!: string | null;

  @Column({ name: "actual_start_date", type: "date", nullable: true })
  actualStartDate!: string | null;

  @Column({ name: "actual_end_date", type: "date", nullable: true })
  actualEndDate!: string | null;

  @Column({ name: "budget_amount", type: "numeric", precision: 18, scale: 2, nullable: true })
  budgetAmount!: string | null;

  @Column({ name: "contract_amount", type: "numeric", precision: 18, scale: 2, nullable: true })
  contractAmount!: string | null;

  @Column({ name: "settlement_amount", type: "numeric", precision: 18, scale: 2, nullable: true })
  settlementAmount!: string | null;

  @Column({ name: "project_manager_id", type: "uuid", nullable: true })
  projectManagerId!: string | null;

  @Column({ name: "engineering_director_id", type: "uuid", nullable: true })
  engineeringDirectorId!: string | null;

  @Column({ name: "contractor_org_id", type: "uuid", nullable: true })
  contractorOrgId!: string | null;

  @Column({ name: "supervisor_org_id", type: "uuid", nullable: true })
  supervisorOrgId!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: EngineeringProjectStatus.DRAFT })
  status!: EngineeringProjectStatus;

  @Column({ name: "progress_percent", type: "integer", default: 0 })
  progressPercent!: number;

  @Column({ name: "risk_level", type: "varchar", length: 32, default: EngineeringRiskLevel.LOW })
  riskLevel!: EngineeringRiskLevel;

  @Column({ name: "quality_score", type: "numeric", precision: 5, scale: 2, nullable: true })
  qualityScore!: string | null;

  @Column({ name: "safety_score", type: "numeric", precision: 5, scale: 2, nullable: true })
  safetyScore!: string | null;

  @Column({ name: "workflow_instance_id", type: "uuid", nullable: true })
  workflowInstanceId!: string | null;

  @Column({ name: "transfer_status", type: "varchar", length: 32, default: EngineeringTransferStatus.NOT_READY })
  transferStatus!: EngineeringTransferStatus;

  @Column({ name: "finance_status", type: "varchar", length: 32, default: EngineeringFinanceStatus.NOT_REQUIRED })
  financeStatus!: EngineeringFinanceStatus;

  @Column({ name: "asset_status", type: "varchar", length: 32, default: EngineeringAssetStatus.NOT_REQUIRED })
  assetStatus!: EngineeringAssetStatus;

  @Column({ name: "attachment_ids", type: "jsonb", nullable: true })
  attachmentIds!: string[] | null;
}
