import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("energy_alert")
@Index("idx_energy_alert_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_energy_alert_meter_status", ["tenantId", "parkId", "meterId", "processStatus", "isDeleted"])
export class EnergyAlertEntity extends AuditableEntity {
  @Column({ name: "meter_id", type: "uuid" })
  meterId!: string;

  @Column({ name: "alert_code", type: "varchar", length: 64 })
  alertCode!: string;

  @Column({ name: "alert_type", type: "varchar", length: 64 })
  alertType!: string;

  @Column({ name: "alert_level", type: "varchar", length: 32 })
  alertLevel!: string;

  @Column({ name: "title", type: "varchar", length: 200 })
  title!: string;

  @Column({ name: "description", type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "triggered_at", type: "timestamptz" })
  triggeredAt!: Date;

  @Column({ name: "acknowledged_at", type: "timestamptz", nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ name: "resolved_at", type: "timestamptz", nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: "process_status", type: "varchar", length: 32, default: "PENDING" })
  processStatus!: string;
}
