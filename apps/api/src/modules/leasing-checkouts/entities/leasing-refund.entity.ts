import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { FileEntity } from "../../files/entities/file.entity";
import { LeasingContractEntity } from "../../leasing-contracts/entities/leasing-contract.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";
import { LeasingCheckoutEntity } from "./leasing-checkout.entity";

@Entity("biz_leasing_refund")
@Index("idx_biz_leasing_refund_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_refund_checkout_entity", ["tenantId", "parkId", "checkoutId"])
@Index("idx_biz_leasing_refund_contract_entity", ["tenantId", "parkId", "contractId"])
@Index("idx_biz_leasing_refund_tenant_company_entity", ["tenantId", "parkId", "parkTenantId"])
@Index("idx_biz_leasing_refund_status_time_entity", ["tenantId", "parkId", "status", "refundTime"])
@Index("uk_biz_leasing_refund_code_entity", ["tenantId", "parkId", "refundCode"], { unique: true, where: "is_deleted = false" })
export class LeasingRefundEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "refund_code", type: "varchar", length: 64 })
  refundCode!: string;

  @Column({ name: "checkout_id", type: "uuid" })
  checkoutId!: string;

  @ManyToOne(() => LeasingCheckoutEntity)
  @JoinColumn({ name: "checkout_id" })
  checkout!: LeasingCheckoutEntity;

  @Column({ name: "contract_id", type: "uuid" })
  contractId!: string;

  @ManyToOne(() => LeasingContractEntity)
  @JoinColumn({ name: "contract_id" })
  contract!: LeasingContractEntity;

  @Column({ name: "park_tenant_id", type: "uuid" })
  parkTenantId!: string;

  @ManyToOne(() => ParkTenantEntity)
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant!: ParkTenantEntity;

  @Column({ name: "refund_amount", type: "numeric", precision: 14, scale: 2 })
  refundAmount!: string;

  @Column({ name: "refund_method", type: "varchar", length: 32 })
  refundMethod!: string;

  @Column({ name: "refund_time", type: "timestamptz" })
  refundTime!: Date;

  @Column({ name: "receiver_name", type: "varchar", length: 100, nullable: true })
  receiverName!: string | null;

  @Column({ name: "receiver_bank_account", type: "varchar", length: 100, nullable: true })
  receiverBankAccount!: string | null;

  @Column({ name: "bank_serial", type: "varchar", length: 100, nullable: true })
  bankSerial!: string | null;

  @Column({ name: "receipt_file_id", type: "uuid", nullable: true })
  receiptFileId!: string | null;

  @ManyToOne(() => FileEntity, { nullable: true })
  @JoinColumn({ name: "receipt_file_id" })
  receiptFile?: FileEntity | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "30" })
  status!: string;
}
