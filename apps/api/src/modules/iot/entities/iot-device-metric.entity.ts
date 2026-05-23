import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_iot_device_metric")
@Index("idx_biz_iot_device_metric_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("uk_biz_iot_device_metric_entity_code", ["tenantId", "parkId", "deviceId", "metricCode"], { unique: true, where: "is_deleted = false" })
export class IotDeviceMetricEntity extends AuditableEntity {
  @Column({ name: "device_id", type: "uuid" })
  deviceId!: string;

  @Column({ name: "metric_code", type: "varchar", length: 64 })
  metricCode!: string;

  @Column({ name: "metric_name", type: "varchar", length: 200 })
  metricName!: string;

  @Column({ name: "value_type", type: "varchar", length: 32, default: "number" })
  valueType!: string;

  @Column({ name: "unit", type: "varchar", length: 32, nullable: true })
  unit!: string | null;

  @Column({ name: "data_key", type: "varchar", length: 100, nullable: true })
  dataKey!: string | null;

  @Column({ name: "precision_digits", type: "integer", nullable: true })
  precisionDigits!: number | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
