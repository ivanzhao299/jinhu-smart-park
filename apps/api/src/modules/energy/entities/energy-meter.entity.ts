import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("energy_meter")
@Index("idx_energy_meter_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_energy_meter_building", ["tenantId", "parkId", "buildingId", "isDeleted"])
@Index("idx_energy_meter_unit", ["tenantId", "parkId", "roomId", "isDeleted"])
@Index("idx_energy_meter_tenant_company", ["tenantId", "parkId", "relatedParkTenantId", "isDeleted"])
@Index("uk_energy_meter_code", ["tenantId", "parkId", "meterCode"], { unique: true, where: "is_deleted = false" })
export class EnergyMeterEntity extends AuditableEntity {
  @Column({ name: "building_id", type: "uuid", nullable: true })
  buildingId!: string | null;

  @Column({ name: "floor_id", type: "uuid", nullable: true })
  floorId!: string | null;

  @Column({ name: "room_id", type: "uuid", nullable: true })
  roomId!: string | null;

  @Column({ name: "area_id", type: "uuid", nullable: true })
  areaId!: string | null;

  @Column({ name: "iot_device_id", type: "uuid", nullable: true })
  iotDeviceId!: string | null;

  @Column({ name: "meter_code", type: "varchar", length: 64 })
  meterCode!: string;

  @Column({ name: "meter_name", type: "varchar", length: 160 })
  meterName!: string;

  @Column({ name: "meter_type", type: "varchar", length: 32 })
  meterType!: string;

  @Column({ name: "meter_purpose", type: "varchar", length: 32, default: "PUBLIC" })
  meterPurpose!: string;

  @Column({ name: "related_park_tenant_id", type: "uuid", nullable: true })
  relatedParkTenantId!: string | null;

  @Column({ name: "multiplier", type: "numeric", precision: 18, scale: 6, default: 1 })
  multiplier!: string;

  @Column({ name: "unit", type: "varchar", length: 32 })
  unit!: string;

  @Column({ name: "initial_reading", type: "numeric", precision: 18, scale: 4, default: 0 })
  initialReading!: string;

  @Column({ name: "current_reading", type: "numeric", precision: 18, scale: 4, default: 0 })
  currentReading!: string;

  @Column({ name: "last_reading_at", type: "timestamptz", nullable: true })
  lastReadingAt!: Date | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "UNKNOWN" })
  status!: string;

  @Column({ name: "is_enabled", type: "boolean", default: true })
  isEnabled!: boolean;
}
