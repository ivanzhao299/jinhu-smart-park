import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("energy_billing_cycle")
@Index("idx_energy_billing_cycle_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("uk_energy_billing_cycle_code", ["tenantId", "parkId", "cycleCode"], { unique: true, where: "is_deleted = false" })
@Index("uk_energy_billing_cycle_period", ["tenantId", "parkId", "meterType", "startDate", "endDate"], { unique: true, where: "is_deleted = false" })
export class EnergyBillingCycleEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "cycle_code", type: "varchar", length: 64 })
  cycleCode!: string;

  @Column({ name: "cycle_name", type: "varchar", length: 160 })
  cycleName!: string;

  @Column({ name: "meter_type", type: "varchar", length: 32 })
  meterType!: string;

  @Column({ name: "start_date", type: "date" })
  startDate!: string;

  @Column({ name: "end_date", type: "date" })
  endDate!: string;

  @Column({ name: "status", type: "varchar", length: 32, default: "DRAFT" })
  status!: string;

  @Column({ name: "calculated_at", type: "timestamptz", nullable: true })
  calculatedAt!: Date | null;

  @Column({ name: "confirmed_at", type: "timestamptz", nullable: true })
  confirmedAt!: Date | null;

  @Column({ name: "posted_at", type: "timestamptz", nullable: true })
  postedAt!: Date | null;
}
