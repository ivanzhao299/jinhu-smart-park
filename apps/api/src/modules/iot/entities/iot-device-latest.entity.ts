import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_iot_device_latest")
@Index("idx_biz_iot_device_latest_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("uk_biz_iot_device_latest_entity_metric", ["tenantId", "parkId", "deviceId", "metricCode"], { unique: true, where: "is_deleted = false" })
export class IotDeviceLatestEntity extends AuditableEntity {
  @Column({ name: "device_id", type: "uuid" })
  deviceId!: string;

  @Column({ name: "device_code", type: "varchar", length: 64 })
  deviceCode!: string;

  @Column({ name: "point_id", type: "uuid", nullable: true })
  pointId!: string | null;

  @Column({ name: "metric_id", type: "uuid", nullable: true })
  metricId!: string | null;

  @Column({ name: "metric_code", type: "varchar", length: 64 })
  metricCode!: string;

  @Column({ name: "value_text", type: "varchar", length: 300, nullable: true })
  valueText!: string | null;

  @Column({ name: "value_number", type: "numeric", precision: 18, scale: 6, nullable: true })
  valueNumber!: string | null;

  @Column({ name: "value_bool", type: "boolean", nullable: true })
  valueBool!: boolean | null;

  @Column({ name: "value_json", type: "jsonb", nullable: true })
  valueJson!: unknown | null;

  @Column({ name: "value_type", type: "varchar", length: 32, default: "number" })
  valueType!: string;

  @Column({ name: "raw_payload", type: "jsonb", default: {} })
  rawPayload!: Record<string, unknown>;

  @Column({ name: "quality", type: "varchar", length: 32, default: "good" })
  quality!: string;

  @Column({ name: "reported_at", type: "timestamptz" })
  reportedAt!: Date;

  @Column({ name: "received_at", type: "timestamptz" })
  receivedAt!: Date;

  @Column({ name: "report_time", type: "timestamptz" })
  reportTime!: Date;
}
