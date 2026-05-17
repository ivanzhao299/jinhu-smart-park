import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { FileEntity } from "../../files/entities/file.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";

@Entity("biz_leasing_invoice")
@Index("idx_biz_leasing_invoice_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_invoice_tenant_company_entity", ["tenantId", "parkId", "parkTenantId"])
@Index("idx_biz_leasing_invoice_status_date_entity", ["tenantId", "parkId", "status", "invoiceDate"])
@Index("uk_biz_leasing_invoice_code_entity", ["tenantId", "parkId", "invoiceCode"], { unique: true, where: "is_deleted = false" })
export class LeasingInvoiceEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "invoice_code", type: "varchar", length: 64 })
  invoiceCode!: string;

  @Column({ name: "park_tenant_id", type: "uuid" })
  parkTenantId!: string;

  @ManyToOne(() => ParkTenantEntity)
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant!: ParkTenantEntity;

  @Column({ name: "invoice_type", type: "varchar", length: 32 })
  invoiceType!: string;

  @Column({ name: "buyer_name", type: "varchar", length: 200 })
  buyerName!: string;

  @Column({ name: "buyer_tax_no", type: "varchar", length: 64, nullable: true })
  buyerTaxNo!: string | null;

  @Column({ name: "amount", type: "numeric", precision: 14, scale: 2 })
  amount!: string;

  @Column({ name: "tax_rate", type: "numeric", precision: 8, scale: 4, default: 0 })
  taxRate!: string;

  @Column({ name: "invoice_no", type: "varchar", length: 100, nullable: true })
  invoiceNo!: string | null;

  @Column({ name: "invoice_date", type: "date" })
  invoiceDate!: string;

  @Column({ name: "file_id", type: "uuid", nullable: true })
  fileId!: string | null;

  @ManyToOne(() => FileEntity, { nullable: true })
  @JoinColumn({ name: "file_id" })
  file?: FileEntity | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "30" })
  status!: string;
}
