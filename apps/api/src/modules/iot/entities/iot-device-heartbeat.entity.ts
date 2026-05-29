import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("iot_device_heartbeat")
@Index("idx_iot_device_heartbeat_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_iot_device_heartbeat_device_time", ["tenantId", "parkId", "deviceId", "heartbeatTime"])
@Index("idx_iot_device_heartbeat_status", ["tenantId", "parkId", "status"])
export class IotDeviceHeartbeatEntity extends AuditableEntity {
  @Column({ name: "device_id", type: "uuid" })
  deviceId!: string;

  @Column({ name: "device_code", type: "varchar", length: 64, nullable: true })
  deviceCode!: string | null;

  @Column({ name: "heartbeat_time", type: "timestamptz" })
  heartbeatTime!: Date;

  @Column({ name: "status", type: "varchar", length: 32 })
  status!: string;

  @Column({ name: "latency_ms", type: "integer", nullable: true })
  latencyMs!: number | null;

  @Column({ name: "signal_strength", type: "numeric", precision: 10, scale: 2, nullable: true })
  signalStrength!: string | null;

  @Column({ name: "battery_level", type: "numeric", precision: 10, scale: 2, nullable: true })
  batteryLevel!: string | null;

  @Column({ name: "firmware_version", type: "varchar", length: 128, nullable: true })
  firmwareVersion!: string | null;

  @Column({ name: "raw_payload", type: "jsonb", default: {} })
  rawPayload!: Record<string, unknown>;
}
