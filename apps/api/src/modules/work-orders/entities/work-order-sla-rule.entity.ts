import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_work_order_sla_rule")
@Index("idx_biz_work_order_sla_rule_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_work_order_sla_rule_match", ["tenantId", "parkId", "woType", "urgency", "priority", "status", "isDeleted"])
@Index("uk_biz_work_order_sla_rule_match_active", ["tenantId", "parkId", "woType", "urgency", "priority"], {
  unique: true,
  where: "is_deleted = false"
})
export class WorkOrderSlaRuleEntity extends AuditableEntity {
  @Column({ name: "wo_type", type: "varchar", length: 64 })
  woType!: string;

  @Column({ name: "urgency", type: "varchar", length: 32 })
  urgency!: string;

  @Column({ name: "priority", type: "varchar", length: 32 })
  priority!: string;

  @Column({ name: "dispatch_sla_min", type: "integer" })
  dispatchSlaMin!: number;

  @Column({ name: "finish_sla_min", type: "integer" })
  finishSlaMin!: number;

  @Column({ name: "escalate_role_code", type: "varchar", length: 64, nullable: true })
  escalateRoleCode!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
