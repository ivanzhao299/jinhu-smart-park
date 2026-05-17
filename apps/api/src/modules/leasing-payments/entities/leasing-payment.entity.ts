import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { FileEntity } from "../../files/entities/file.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";

@Entity("biz_leasing_payment")
@Index("idx_biz_leasing_payment_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_payment_tenant_company_entity", ["tenantId", "parkId", "parkTenantId"])
@Index("idx_biz_leasing_payment_status_time_entity", ["tenantId", "parkId", "status", "payTime"])
@Index("uk_biz_leasing_payment_code_entity", ["tenantId", "parkId", "payCode"], { unique: true, where: "is_deleted = false" })
export class LeasingPaymentEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "pay_code", type: "varchar", length: 64 })
  payCode!: string;

  @Column({ name: "park_tenant_id", type: "uuid" })
  parkTenantId!: string;

  @ManyToOne(() => ParkTenantEntity)
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant!: ParkTenantEntity;

  @Column({ name: "pay_time", type: "timestamptz" })
  payTime!: Date;

  @Column({ name: "pay_method", type: "varchar", length: 32 })
  payMethod!: string;

  @Column({ name: "pay_amount", type: "numeric", precision: 14, scale: 2 })
  payAmount!: string;

  @Column({ name: "unapplied_amount", type: "numeric", precision: 14, scale: 2 })
  unappliedAmount!: string;

  @Column({ name: "payer_name", type: "varchar", length: 100, nullable: true })
  payerName!: string | null;

  @Column({ name: "bank_serial", type: "varchar", length: 100, nullable: true })
  bankSerial!: string | null;

  @Column({ name: "receipt_file_id", type: "uuid", nullable: true })
  receiptFileId!: string | null;

  @ManyToOne(() => FileEntity, { nullable: true })
  @JoinColumn({ name: "receipt_file_id" })
  receiptFile?: FileEntity | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;
}
