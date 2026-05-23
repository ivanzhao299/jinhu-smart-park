import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_iot_point")
@Index("idx_biz_iot_point_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_iot_point_entity_device", ["tenantId", "parkId", "deviceId", "isDeleted"])
@Index("uk_biz_iot_point_entity_device_code", ["tenantId", "parkId", "deviceId", "pointCode"], { unique: true, where: "is_deleted = false" })
export class IotPointEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "point_code", type: "varchar", length: 64 })
  pointCode!: string;

  @Column({ name: "device_id", type: "uuid" })
  deviceId!: string;

  @Column({ name: "metric_id", type: "uuid", nullable: true })
  metricId!: string | null;

  @Column({ name: "metric_code", type: "varchar", length: 64, nullable: true })
  metricCode!: string | null;

  @Column({ name: "point_name", type: "varchar", length: 200 })
  pointName!: string;

  @Column({ name: "point_type", type: "varchar", length: 32, default: "telemetry" })
  pointType!: string;

  @Column({ name: "value_type", type: "varchar", length: 32, default: "number" })
  valueType!: string;

  @Column({ name: "unit", type: "varchar", length: 32, nullable: true })
  unit!: string | null;

  @Column({ name: "report_topic", type: "varchar", length: 256, nullable: true })
  reportTopic!: string | null;

  @Column({ name: "report_key", type: "varchar", length: 120, nullable: true })
  reportKey!: string | null;

  @Column({ name: "min_value", type: "numeric", precision: 18, scale: 6, nullable: true })
  minValue!: string | null;

  @Column({ name: "max_value", type: "numeric", precision: 18, scale: 6, nullable: true })
  maxValue!: string | null;

  @Column({ name: "last_value", type: "numeric", precision: 18, scale: 6, nullable: true })
  lastValue!: string | null;

  @Column({ name: "last_value_text", type: "text", nullable: true })
  lastValueText!: string | null;

  @Column({ name: "last_report_time", type: "timestamptz", nullable: true })
  lastReportTime!: Date | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
