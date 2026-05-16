import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { LeasingLeadEntity } from "./leasing-lead.entity";

@Entity("biz_leasing_lead_status_log")
@Index("idx_biz_leasing_lead_status_log_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_lead_status_log_lead_time_entity", ["tenantId", "parkId", "leadId", "opTime"])
export class LeasingLeadStatusLogEntity extends AuditableEntity {
  @Column({ name: "lead_id", type: "uuid" })
  leadId!: string;

  @ManyToOne(() => LeasingLeadEntity)
  @JoinColumn({ name: "lead_id" })
  lead!: LeasingLeadEntity;

  @Column({ name: "before_status", type: "varchar", length: 32 })
  beforeStatus!: string;

  @Column({ name: "after_status", type: "varchar", length: 32 })
  afterStatus!: string;

  @Column({ name: "reason", type: "varchar", length: 500 })
  reason!: string;

  @Column({ name: "operator_id", type: "uuid", nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 100, nullable: true })
  operatorName!: string | null;

  @Column({ name: "op_time", type: "timestamptz" })
  opTime!: Date;
}
