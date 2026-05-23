import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_iot_metric")
@Index("idx_biz_iot_metric_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("uk_biz_iot_metric_entity_code", ["tenantId", "parkId", "metricCode"], { unique: true, where: "is_deleted = false" })
export class IotMetricEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "metric_code", type: "varchar", length: 64 })
  metricCode!: string;

  @Column({ name: "metric_name", type: "varchar", length: 200 })
  metricName!: string;

  @Column({ name: "device_type", type: "varchar", length: 64, nullable: true })
  deviceType!: string | null;

  @Column({ name: "value_type", type: "varchar", length: 32 })
  valueType!: string;

  @Column({ name: "unit", type: "varchar", length: 32, nullable: true })
  unit!: string | null;

  @Column({ name: "precision_digits", type: "integer", nullable: true })
  precisionDigits!: number | null;

  @Column({ name: "enum_map", type: "jsonb", default: {} })
  enumMap!: Record<string, unknown>;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
