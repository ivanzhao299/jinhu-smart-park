import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { LeasingReceivableEntity } from "../../leasing-receivables/entities/leasing-receivable.entity";
import { LeasingInvoiceEntity } from "./leasing-invoice.entity";

@Entity("rel_leasing_invoice_receivable")
@Index("idx_rel_leasing_invoice_receivable_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_rel_leasing_invoice_receivable_invoice_entity", ["tenantId", "parkId", "invoiceId"])
@Index("idx_rel_leasing_invoice_receivable_receivable_entity", ["tenantId", "parkId", "receivableId"])
export class LeasingInvoiceReceivableEntity extends AuditableEntity {
  @Column({ name: "invoice_id", type: "uuid" })
  invoiceId!: string;

  @ManyToOne(() => LeasingInvoiceEntity)
  @JoinColumn({ name: "invoice_id" })
  invoice!: LeasingInvoiceEntity;

  @Column({ name: "receivable_id", type: "uuid" })
  receivableId!: string;

  @ManyToOne(() => LeasingReceivableEntity)
  @JoinColumn({ name: "receivable_id" })
  receivable!: LeasingReceivableEntity;

  @Column({ name: "invoice_amount", type: "numeric", precision: 14, scale: 2 })
  invoiceAmount!: string;
}
