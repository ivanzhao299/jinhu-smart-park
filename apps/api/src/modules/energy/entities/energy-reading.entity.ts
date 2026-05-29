import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("energy_reading")
@Index("idx_energy_reading_meter_time", ["tenantId", "parkId", "meterId", "readingTime"])
@Index("idx_energy_reading_scope", ["tenantId", "parkId"])
export class EnergyReadingEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "meter_id", type: "uuid" })
  meterId!: string;

  @Column({ name: "iot_device_id", type: "uuid", nullable: true })
  iotDeviceId!: string | null;

  @Column({ name: "reading_value", type: "numeric", precision: 18, scale: 4 })
  readingValue!: string;

  @Column({ name: "previous_reading_value", type: "numeric", precision: 18, scale: 4 })
  previousReadingValue!: string;

  @Column({ name: "consumption_value", type: "numeric", precision: 18, scale: 4 })
  consumptionValue!: string;

  @Column({ name: "reading_time", type: "timestamptz" })
  readingTime!: Date;

  @Column({ name: "reading_source", type: "varchar", length: 32, default: "MANUAL" })
  readingSource!: string;

  @Column({ name: "confirmation_status", type: "varchar", length: 32, default: "PENDING" })
  confirmationStatus!: string;

  @Column({ name: "raw_payload", type: "jsonb", default: {} })
  rawPayload!: Record<string, unknown>;

  @Column({ name: "created_by", type: "uuid", nullable: true })
  createdBy!: string | null;

  @Column({ name: "confirmed_by", type: "uuid", nullable: true })
  confirmedBy!: string | null;

  @Column({ name: "confirmed_at", type: "timestamptz", nullable: true })
  confirmedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
