import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("iot_rule_execution_log")
@Index("idx_iot_rule_execution_log_entity_rule_time", ["tenantId", "parkId", "ruleId", "executedAt", "isDeleted"])
@Index("idx_iot_rule_execution_log_entity_status", ["tenantId", "parkId", "executionStatus", "executedAt", "isDeleted"])
export class IotRuleExecutionLogEntity extends AuditableEntity {
  @Column({ name: "rule_id", type: "uuid" })
  ruleId!: string;

  @Column({ name: "trigger_type", type: "varchar", length: 32 })
  triggerType!: string;

  @Column({ name: "trigger_payload", type: "jsonb", default: () => "'{}'::jsonb" })
  triggerPayload!: Record<string, unknown>;

  @Column({ name: "action_result", type: "jsonb", default: () => "'[]'::jsonb" })
  actionResult!: Array<Record<string, unknown>>;

  @Column({ name: "execution_status", type: "varchar", length: 32 })
  executionStatus!: string;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage!: string | null;

  @Column({ name: "executed_at", type: "timestamptz", default: () => "now()" })
  executedAt!: Date;
}
