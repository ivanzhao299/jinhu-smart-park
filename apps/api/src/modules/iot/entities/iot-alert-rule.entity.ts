import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_iot_alert_rule")
@Index("idx_biz_iot_alert_rule_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("uk_biz_iot_alert_rule_entity_code", ["tenantId", "parkId", "ruleCode"], { unique: true, where: "is_deleted = false" })
@Index("idx_biz_iot_alert_rule_entity_metric", ["tenantId", "parkId", "metricCode", "enabled", "isDeleted"])
export class IotAlertRuleEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "rule_code", type: "varchar", length: 64 })
  ruleCode!: string;

  @Column({ name: "rule_name", type: "varchar", length: 200 })
  ruleName!: string;

  @Column({ name: "device_id", type: "uuid", nullable: true })
  deviceId!: string | null;

  @Column({ name: "device_type", type: "varchar", length: 64, nullable: true })
  deviceType!: string | null;

  @Column({ name: "point_id", type: "uuid", nullable: true })
  pointId!: string | null;

  @Column({ name: "metric_code", type: "varchar", length: 64 })
  metricCode!: string;

  @Column({ name: "operator", type: "varchar", length: 16 })
  operator!: string;

  @Column({ name: "threshold_value", type: "numeric", precision: 18, scale: 6, nullable: true })
  thresholdValue!: string | null;

  @Column({ name: "threshold_text", type: "varchar", length: 200, nullable: true })
  thresholdText!: string | null;

  @Column({ name: "alert_level", type: "varchar", length: 32, default: "warning" })
  alertLevel!: string;

  @Column({ name: "alert_title_template", type: "varchar", length: 300, nullable: true })
  alertTitleTemplate!: string | null;

  @Column({ name: "alert_content_template", type: "text", nullable: true })
  alertContentTemplate!: string | null;

  @Column({ name: "duration_seconds", type: "integer", nullable: true })
  durationSeconds!: number | null;

  @Column({ name: "cooldown_seconds", type: "integer", nullable: true })
  cooldownSeconds!: number | null;

  @Column({ name: "enabled", type: "boolean", default: true })
  enabled!: boolean;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
