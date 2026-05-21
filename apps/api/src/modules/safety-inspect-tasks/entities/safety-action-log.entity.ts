import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_safety_action_log")
@Index("idx_biz_safety_action_log_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_action_log_biz", ["tenantId", "parkId", "bizType", "bizId", "opTime"])
export class SafetyActionLogEntity extends AuditableEntity {
  @Column({ name: "biz_type", type: "varchar", length: 64 })
  bizType!: string;

  @Column({ name: "biz_id", type: "uuid", nullable: true })
  bizId!: string | null;

  @Column({ name: "action", type: "varchar", length: 64 })
  action!: string;

  @Column({ name: "before_status", type: "varchar", length: 32, nullable: true })
  beforeStatus!: string | null;

  @Column({ name: "after_status", type: "varchar", length: 32, nullable: true })
  afterStatus!: string | null;

  @Column({ name: "operator_id", type: "uuid", nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 100, nullable: true })
  operatorName!: string | null;

  @Column({ name: "reason", type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ name: "content", type: "text", nullable: true })
  content!: string | null;

  @Column({ name: "op_time", type: "timestamptz" })
  opTime!: Date;

  @Column({ name: "payload", type: "jsonb", default: {} })
  payload!: Record<string, unknown>;
}
