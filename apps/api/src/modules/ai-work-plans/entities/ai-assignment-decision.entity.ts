import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_ai_assignment_decision")
@Index("idx_biz_ai_assignment_decision_task", ["tenantId", "parkId", "taskId", "score"])
export class AiAssignmentDecisionEntity extends AuditableEntity {
  @Column({ name: "plan_id", type: "uuid" })
  planId!: string;

  @Column({ name: "task_id", type: "uuid" })
  taskId!: string;

  @Column({ name: "candidate_user_id", type: "uuid" })
  candidateUserId!: string;

  @Column({ name: "candidate_name", type: "varchar", length: 100 })
  candidateName!: string;

  @Column({ name: "org_id", type: "uuid", nullable: true })
  orgId!: string | null;

  @Column({ name: "org_name", type: "varchar", length: 100, nullable: true })
  orgName!: string | null;

  @Column({ name: "role_codes", type: "jsonb", default: [] })
  roleCodes!: string[];

  @Column({ name: "post_name", type: "varchar", length: 100, nullable: true })
  postName!: string | null;

  @Column({ name: "active_workload", type: "integer", default: 0 })
  activeWorkload!: number;

  @Column({ name: "score", type: "double precision" })
  score!: number;

  @Column({ name: "reasons", type: "jsonb", default: [] })
  reasons!: string[];

  @Column({ name: "is_selected", type: "boolean", default: false })
  isSelected!: boolean;
}
