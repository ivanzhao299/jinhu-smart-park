import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_iot_device")
@Index("idx_biz_iot_device_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_iot_device_entity_unit", ["tenantId", "parkId", "unitId", "isDeleted"])
@Index("idx_biz_iot_device_entity_park_tenant", ["tenantId", "parkId", "parkTenantId", "isDeleted"])
@Index("uk_biz_iot_device_entity_code", ["tenantId", "parkId", "deviceCode"], { unique: true, where: "is_deleted = false" })
@Index("idx_biz_iot_device_entity_gateway", ["tenantId", "parkId", "gatewayId", "isDeleted"])
export class IotDeviceEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "device_code", type: "varchar", length: 64 })
  deviceCode!: string;

  @Column({ name: "device_name", type: "varchar", length: 200 })
  deviceName!: string;

  @Column({ name: "device_type", type: "varchar", length: 64 })
  deviceType!: string;

  @Column({ name: "protocol_type", type: "varchar", length: 64 })
  protocolType!: string;

  @Column({ name: "vendor_platform", type: "varchar", length: 64, nullable: true })
  vendorPlatform!: string | null;

  @Column({ name: "vendor_name", type: "varchar", length: 120, nullable: true })
  vendorName!: string | null;

  @Column({ name: "vendor_device_id", type: "varchar", length: 128, nullable: true })
  vendorDeviceId!: string | null;

  @Column({ name: "gateway_id", type: "uuid", nullable: true })
  gatewayId!: string | null;

  @Column({ name: "device_secret", type: "text", nullable: true })
  deviceSecret!: string | null;

  @Column({ name: "device_secret_hash", type: "varchar", length: 128, nullable: true })
  deviceSecretHash!: string | null;

  @Column({ name: "building_id", type: "uuid", nullable: true })
  buildingId!: string | null;

  @Column({ name: "floor_id", type: "uuid", nullable: true })
  floorId!: string | null;

  @Column({ name: "unit_id", type: "uuid", nullable: true })
  unitId!: string | null;

  @Column({ name: "park_tenant_id", type: "uuid", nullable: true })
  parkTenantId!: string | null;

  @Column({ name: "location", type: "varchar", length: 300, nullable: true })
  location!: string | null;

  @Column({ name: "install_position", type: "varchar", length: 200, nullable: true })
  installPosition!: string | null;

  @Column({ name: "gps_lng", type: "numeric", precision: 12, scale: 8, nullable: true })
  gpsLng!: string | null;

  @Column({ name: "gps_lat", type: "numeric", precision: 12, scale: 8, nullable: true })
  gpsLat!: string | null;

  @Column({ name: "install_date", type: "date", nullable: true })
  installDate!: string | null;

  @Column({ name: "warranty_end_date", type: "date", nullable: true })
  warrantyEndDate!: string | null;

  @Column({ name: "online_status", type: "varchar", length: 32, default: "offline" })
  onlineStatus!: string;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @Column({ name: "last_report_time", type: "timestamptz", nullable: true })
  lastReportTime!: Date | null;

  @Column({ name: "last_online_time", type: "timestamptz", nullable: true })
  lastOnlineTime!: Date | null;

  @Column({ name: "last_offline_time", type: "timestamptz", nullable: true })
  lastOfflineTime!: Date | null;

  @Column({ name: "last_data_time", type: "timestamptz", nullable: true })
  lastDataTime!: Date | null;

  @Column({ name: "metadata", type: "jsonb", default: {} })
  metadata!: Record<string, unknown>;

  @Column({ name: "status_payload", type: "jsonb", default: {} })
  statusPayload!: Record<string, unknown>;
}
