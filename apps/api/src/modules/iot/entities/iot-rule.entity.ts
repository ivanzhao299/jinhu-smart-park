import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("iot_rule")
@Index("idx_iot_rule_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("uk_iot_rule_entity_code", ["tenantId", "parkId", "ruleCode"], { unique: true, where: "is_deleted = false" })
@Index("idx_iot_rule_entity_type_status", ["tenantId", "parkId", "ruleType", "status", "isDeleted"])
export class IotRuleEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "rule_code", type: "varchar", length: 64 })
  ruleCode!: string;

  @Column({ name: "rule_name", type: "varchar", length: 200 })
  ruleName!: string;

  @Column({ name: "rule_type", type: "varchar", length: 32 })
  ruleType!: string;

  @Column({ name: "trigger_scope", type: "varchar", length: 32, default: "PARK" })
  triggerScope!: string;

  @Column({ name: "device_id", type: "uuid", nullable: true })
  deviceId!: string | null;

  @Column({ name: "device_type", type: "varchar", length: 64, nullable: true })
  deviceType!: string | null;

  @Column({ name: "area_id", type: "uuid", nullable: true })
  areaId!: string | null;

  @Column({ name: "condition_json", type: "jsonb", default: () => "'{}'::jsonb" })
  conditionJson!: Record<string, unknown>;

  @Column({ name: "action_json", type: "jsonb", default: () => "'[]'::jsonb" })
  actionJson!: Array<Record<string, unknown>>;

  @Column({ name: "priority", type: "integer", default: 100 })
  priority!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "DISABLED" })
  status!: string;

  @Column({ name: "last_triggered_at", type: "timestamptz", nullable: true })
  lastTriggeredAt!: Date | null;
}
