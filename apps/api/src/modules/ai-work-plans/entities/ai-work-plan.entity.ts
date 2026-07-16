import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import type { AiWorkPlanRisk, AiWorkPlanStatus } from "../domain/ai-work-plan.types";

@Entity("biz_ai_work_plan")
@Index("uk_biz_ai_work_plan_code", ["tenantId", "parkId", "planCode"], { unique: true, where: "is_deleted = false" })
@Index("idx_biz_ai_work_plan_status", ["tenantId", "parkId", "status", "createTime"])
export class AiWorkPlanEntity extends AuditableEntity {
  @Column({ name: "plan_code", type: "varchar", length: 64 })
  planCode!: string;

  @Column({ name: "raw_instruction", type: "text" })
  rawInstruction!: string;

  @Column({ name: "normalized_goal", type: "text" })
  normalizedGoal!: string;

  @Column({ name: "planner_mode", type: "varchar", length: 32, default: "local_semantic_rules" })
  plannerMode!: string;

  @Column({ name: "planner_version", type: "varchar", length: 32, default: "v1" })
  plannerVersion!: string;

  @Column({ name: "status", type: "varchar", length: 32, default: "DRAFT" })
  status!: AiWorkPlanStatus;

  @Column({ name: "risk_level", type: "varchar", length: 16, default: "LOW" })
  riskLevel!: AiWorkPlanRisk;

  @Column({ name: "location_text", type: "varchar", length: 300, nullable: true })
  locationText!: string | null;

  @Column({ name: "target_org_id", type: "uuid", nullable: true })
  targetOrgId!: string | null;

  @Column({ name: "assumptions", type: "jsonb", default: [] })
  assumptions!: string[];

  @Column({ name: "clarification_questions", type: "jsonb", default: [] })
  clarificationQuestions!: string[];

  @Column({ name: "task_count", type: "integer", default: 0 })
  taskCount!: number;

  @Column({ name: "approved_by", type: "uuid", nullable: true })
  approvedBy!: string | null;

  @Column({ name: "approved_at", type: "timestamptz", nullable: true })
  approvedAt!: Date | null;

  @Column({ name: "approval_comment", type: "varchar", length: 1000, nullable: true })
  approvalComment!: string | null;

  @Column({ name: "materialized_by", type: "uuid", nullable: true })
  materializedBy!: string | null;

  @Column({ name: "materialized_at", type: "timestamptz", nullable: true })
  materializedAt!: Date | null;

  @Column({ name: "rejected_by", type: "uuid", nullable: true })
  rejectedBy!: string | null;

  @Column({ name: "rejected_at", type: "timestamptz", nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: "rejection_reason", type: "varchar", length: 1000, nullable: true })
  rejectionReason!: string | null;
}
