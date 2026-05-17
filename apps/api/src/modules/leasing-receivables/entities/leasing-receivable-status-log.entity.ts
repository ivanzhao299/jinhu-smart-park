import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { LeasingReceivableEntity } from "./leasing-receivable.entity";

@Entity("biz_leasing_receivable_status_log")
@Index("idx_biz_leasing_receivable_status_log_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_receivable_status_log_receivable_entity", ["tenantId", "parkId", "receivableId", "opTime"])
export class LeasingReceivableStatusLogEntity extends AuditableEntity {
  @Column({ name: "receivable_id", type: "uuid" })
  receivableId!: string;

  @ManyToOne(() => LeasingReceivableEntity)
  @JoinColumn({ name: "receivable_id" })
  receivable!: LeasingReceivableEntity;

  @Column({ name: "before_status", type: "varchar", length: 32, nullable: true })
  beforeStatus!: string | null;

  @Column({ name: "after_status", type: "varchar", length: 32 })
  afterStatus!: string;

  @Column({ name: "action", type: "varchar", length: 32 })
  action!:
    | "create"
    | "generate"
    | "regenerate"
    | "adjust"
    | "payment"
    | "payment_apply"
    | "overdue"
    | "waiver"
    | "waiver_apply"
    | "waiver_approve"
    | "invoice"
    | "delete"
    | "void"
    | "system";

  @Column({ name: "reason", type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ name: "operator_id", type: "varchar", length: 64, nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 100, nullable: true })
  operatorName!: string | null;

  @Column({ name: "op_time", type: "timestamptz", default: () => "now()" })
  opTime!: Date;
}
