import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import type { AiWorkPlanTaskStatus } from "../domain/ai-work-plan.types";

@Entity("biz_ai_work_plan_task")
@Index("uk_biz_ai_work_plan_task_code", ["tenantId", "parkId", "taskCode"], { unique: true, where: "is_deleted = false" })
@Index("idx_biz_ai_work_plan_task_plan", ["tenantId", "parkId", "planId", "sequenceNo"])
export class AiWorkPlanTaskEntity extends AuditableEntity {
  @Column({ name: "plan_id", type: "uuid" })
  planId!: string;

  @Column({ name: "task_code", type: "varchar", length: 80 })
  taskCode!: string;

  @Column({ name: "sequence_no", type: "integer" })
  sequenceNo!: number;

  @Column({ name: "title", type: "varchar", length: 200 })
  title!: string;

  @Column({ name: "description", type: "text" })
  description!: string;

  @Column({ name: "work_order_type", type: "varchar", length: 64, default: "other" })
  workOrderType!: string;

  @Column({ name: "department_id", type: "uuid", nullable: true })
  departmentId!: string | null;

  @Column({ name: "department_name", type: "varchar", length: 100, nullable: true })
  departmentName!: string | null;

  @Column({ name: "role_code", type: "varchar", length: 64, nullable: true })
  roleCode!: string | null;

  @Column({ name: "role_name", type: "varchar", length: 100, nullable: true })
  roleName!: string | null;

  @Column({ name: "suggested_assignee_id", type: "uuid", nullable: true })
  suggestedAssigneeId!: string | null;

  @Column({ name: "suggested_assignee_name", type: "varchar", length: 100, nullable: true })
  suggestedAssigneeName!: string | null;

  @Column({ name: "confirmed_assignee_id", type: "uuid", nullable: true })
  confirmedAssigneeId!: string | null;

  @Column({ name: "confirmed_assignee_name", type: "varchar", length: 100, nullable: true })
  confirmedAssigneeName!: string | null;

  @Column({ name: "assignment_strategy", type: "varchar", length: 32, default: "department_dispatch" })
  assignmentStrategy!: string;

  @Column({ name: "assignment_confidence", type: "double precision", default: 0 })
  assignmentConfidence!: number;

  @Column({ name: "priority", type: "varchar", length: 16, default: "medium" })
  priority!: "low" | "medium" | "high";

  @Column({ name: "urgency", type: "varchar", length: 16, default: "normal" })
  urgency!: "low" | "normal" | "urgent" | "critical";

  @Column({ name: "due_at", type: "timestamptz", nullable: true })
  dueAt!: Date | null;

  @Column({ name: "planned_effort_minutes", type: "integer", nullable: true })
  plannedEffortMinutes!: number | null;

  @Column({ name: "dependency_task_codes", type: "jsonb", default: [] })
  dependencyTaskCodes!: string[];

  @Column({ name: "acceptance_criteria", type: "text" })
  acceptanceCriteria!: string;

  @Column({ name: "evidence_requirements", type: "jsonb", default: [] })
  evidenceRequirements!: string[];

  @Column({ name: "speed_weight", type: "smallint", default: 50 })
  speedWeight!: number;

  @Column({ name: "quality_weight", type: "smallint", default: 50 })
  qualityWeight!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "PLANNED" })
  status!: AiWorkPlanTaskStatus;

  @Column({ name: "work_order_id", type: "uuid", nullable: true })
  workOrderId!: string | null;
}
