import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { EngineeringPlanLevel, EngineeringPlanStatus, EngineeringPlanType, EngineeringRiskLevel } from "../domain/engineering-project.enums";

@Entity("biz_engineering_plan")
@Index("idx_biz_engineering_plan_tenant_deleted", ["tenantId", "isDeleted"])
@Index("idx_biz_engineering_plan_org", ["tenantId", "orgId", "isDeleted"])
@Index("idx_biz_engineering_plan_project", ["tenantId", "projectId", "isDeleted"])
@Index("idx_biz_engineering_plan_parent", ["tenantId", "parentPlanId", "isDeleted"])
@Index("idx_biz_engineering_plan_type", ["tenantId", "planType", "isDeleted"])
@Index("idx_biz_engineering_plan_status", ["tenantId", "status", "isDeleted"])
@Index("idx_biz_engineering_plan_owner_user", ["tenantId", "ownerUserId", "isDeleted"])
@Index("idx_biz_engineering_plan_owner_org", ["tenantId", "ownerOrgId", "isDeleted"])
@Index("idx_biz_engineering_plan_contractor", ["tenantId", "contractorOrgId", "isDeleted"])
@Index("idx_biz_engineering_plan_planned_start", ["tenantId", "plannedStartDate", "isDeleted"])
@Index("idx_biz_engineering_plan_sort", ["tenantId", "projectId", "sortOrder", "isDeleted"])
@Index("uk_biz_engineering_plan_code", ["tenantId", "planCode"], { unique: true, where: "is_deleted = false" })
export class EngineeringPlanEntity extends AuditableEntity {
  @Column({ name: "org_id", type: "uuid", nullable: true })
  orgId!: string | null;

  @Column({ name: "project_id", type: "uuid" })
  projectId!: string;

  @Column({ name: "plan_code", type: "varchar", length: 64 })
  planCode!: string;

  @Column({ name: "plan_name", type: "varchar", length: 200 })
  planName!: string;

  @Column({ name: "plan_type", type: "varchar", length: 32 })
  planType!: EngineeringPlanType;

  @Column({ name: "parent_plan_id", type: "uuid", nullable: true })
  parentPlanId!: string | null;

  @Column({ name: "plan_level", type: "varchar", length: 16, default: EngineeringPlanLevel.L1 })
  planLevel!: EngineeringPlanLevel;

  @Column({ name: "description", type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "planned_start_date", type: "date", nullable: true })
  plannedStartDate!: string | null;

  @Column({ name: "planned_end_date", type: "date", nullable: true })
  plannedEndDate!: string | null;

  @Column({ name: "actual_start_date", type: "date", nullable: true })
  actualStartDate!: string | null;

  @Column({ name: "actual_end_date", type: "date", nullable: true })
  actualEndDate!: string | null;

  @Column({ name: "planned_progress_percent", type: "integer", default: 0 })
  plannedProgressPercent!: number;

  @Column({ name: "actual_progress_percent", type: "integer", default: 0 })
  actualProgressPercent!: number;

  @Column({ name: "weight", type: "numeric", precision: 8, scale: 2, nullable: true })
  weight!: string | null;

  @Column({ name: "owner_user_id", type: "uuid", nullable: true })
  ownerUserId!: string | null;

  @Column({ name: "owner_org_id", type: "uuid", nullable: true })
  ownerOrgId!: string | null;

  @Column({ name: "contractor_org_id", type: "uuid", nullable: true })
  contractorOrgId!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: EngineeringPlanStatus.DRAFT })
  status!: EngineeringPlanStatus;

  @Column({ name: "delay_days", type: "integer", default: 0 })
  delayDays!: number;

  @Column({ name: "risk_level", type: "varchar", length: 32, default: EngineeringRiskLevel.LOW })
  riskLevel!: EngineeringRiskLevel;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "attachment_ids", type: "jsonb", nullable: true })
  attachmentIds!: string[] | null;
}
