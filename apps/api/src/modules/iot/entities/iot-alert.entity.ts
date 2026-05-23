import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_iot_alert")
@Index("idx_biz_iot_alert_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_iot_alert_entity_status", ["tenantId", "parkId", "status", "isDeleted"])
@Index("uk_biz_iot_alert_entity_code", ["tenantId", "parkId", "alertCode"], { unique: true, where: "is_deleted = false" })
export class IotAlertEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "alert_code", type: "varchar", length: 64 })
  alertCode!: string;

  @Column({ name: "rule_id", type: "uuid", nullable: true })
  ruleId!: string | null;

  @Column({ name: "device_id", type: "uuid" })
  deviceId!: string;

  @Column({ name: "device_code", type: "varchar", length: 64 })
  deviceCode!: string;

  @Column({ name: "device_name", type: "varchar", length: 200 })
  deviceName!: string;

  @Column({ name: "point_id", type: "uuid", nullable: true })
  pointId!: string | null;

  @Column({ name: "metric_code", type: "varchar", length: 64 })
  metricCode!: string;

  @Column({ name: "metric_name", type: "varchar", length: 200, nullable: true })
  metricName!: string | null;

  @Column({ name: "alert_level", type: "varchar", length: 32 })
  alertLevel!: string;

  @Column({ name: "alert_title", type: "varchar", length: 200 })
  alertTitle!: string;

  @Column({ name: "alert_content", type: "text", nullable: true })
  alertContent!: string | null;

  @Column({ name: "trigger_value", type: "varchar", length: 100, nullable: true })
  triggerValue!: string | null;

  @Column({ name: "threshold_value", type: "varchar", length: 100, nullable: true })
  thresholdValue!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;

  @Column({ name: "payload", type: "jsonb", default: {} })
  payload!: Record<string, unknown>;

  @Column({ name: "trigger_payload", type: "jsonb", default: {} })
  triggerPayload!: Record<string, unknown>;

  @Column({ name: "first_trigger_time", type: "timestamptz" })
  firstTriggerTime!: Date;

  @Column({ name: "last_trigger_time", type: "timestamptz" })
  lastTriggerTime!: Date;

  @Column({ name: "ack_time", type: "timestamptz", nullable: true })
  ackTime!: Date | null;

  @Column({ name: "ack_by", type: "uuid", nullable: true })
  ackBy!: string | null;

  @Column({ name: "ack_by_name", type: "varchar", length: 100, nullable: true })
  ackByName!: string | null;

  @Column({ name: "acknowledge_time", type: "timestamptz", nullable: true })
  acknowledgeTime!: Date | null;

  @Column({ name: "acknowledge_by", type: "uuid", nullable: true })
  acknowledgeBy!: string | null;

  @Column({ name: "handle_time", type: "timestamptz", nullable: true })
  handleTime!: Date | null;

  @Column({ name: "handle_by", type: "uuid", nullable: true })
  handleBy!: string | null;

  @Column({ name: "handle_by_name", type: "varchar", length: 100, nullable: true })
  handleByName!: string | null;

  @Column({ name: "handle_note", type: "text", nullable: true })
  handleNote!: string | null;

  @Column({ name: "close_time", type: "timestamptz", nullable: true })
  closeTime!: Date | null;

  @Column({ name: "close_by", type: "uuid", nullable: true })
  closeBy!: string | null;

  @Column({ name: "close_by_name", type: "varchar", length: 100, nullable: true })
  closeByName!: string | null;

  @Column({ name: "close_reason", type: "varchar", length: 500, nullable: true })
  closeReason!: string | null;

  @Column({ name: "work_order_id", type: "uuid", nullable: true })
  workOrderId!: string | null;

  @Column({ name: "building_id", type: "uuid", nullable: true })
  buildingId!: string | null;

  @Column({ name: "floor_id", type: "uuid", nullable: true })
  floorId!: string | null;

  @Column({ name: "unit_id", type: "uuid", nullable: true })
  unitId!: string | null;

  @Column({ name: "park_tenant_id", type: "uuid", nullable: true })
  parkTenantId!: string | null;
}
