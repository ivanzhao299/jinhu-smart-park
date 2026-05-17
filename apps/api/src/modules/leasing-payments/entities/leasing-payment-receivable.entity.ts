import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { LeasingReceivableEntity } from "../../leasing-receivables/entities/leasing-receivable.entity";
import { LeasingPaymentEntity } from "./leasing-payment.entity";

@Entity("rel_leasing_payment_receivable")
@Index("idx_rel_leasing_payment_receivable_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_rel_leasing_payment_receivable_payment_entity", ["tenantId", "parkId", "paymentId"])
@Index("idx_rel_leasing_payment_receivable_receivable_entity", ["tenantId", "parkId", "receivableId"])
export class LeasingPaymentReceivableEntity extends AuditableEntity {
  @Column({ name: "payment_id", type: "uuid" })
  paymentId!: string;

  @ManyToOne(() => LeasingPaymentEntity)
  @JoinColumn({ name: "payment_id" })
  payment!: LeasingPaymentEntity;

  @Column({ name: "receivable_id", type: "uuid" })
  receivableId!: string;

  @ManyToOne(() => LeasingReceivableEntity)
  @JoinColumn({ name: "receivable_id" })
  receivable!: LeasingReceivableEntity;

  @Column({ name: "applied_amount", type: "numeric", precision: 14, scale: 2 })
  appliedAmount!: string;
}
