import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_safety_hazard_status_log")
@Index("idx_biz_safety_hazard_status_log_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_hazard_status_log_hazard", ["tenantId", "parkId", "hazardId", "opTime"])
export class SafetyHazardStatusLogEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "hazard_id", type: "uuid" })
  hazardId!: string;

  @Column({ name: "before_status", type: "varchar", length: 32, nullable: true })
  beforeStatus!: string | null;

  @Column({ name: "after_status", type: "varchar", length: 32 })
  afterStatus!: string;

  @Column({ name: "action", type: "varchar", length: 64 })
  action!: string;

  @Column({ name: "reason", type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ name: "operator_id", type: "uuid", nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 100, nullable: true })
  operatorName!: string | null;

  @Column({ name: "op_time", type: "timestamptz" })
  opTime!: Date;
}
