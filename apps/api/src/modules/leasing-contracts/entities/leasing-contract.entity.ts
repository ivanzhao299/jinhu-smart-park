import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { FileEntity } from "../../files/entities/file.entity";
import { LeasingLeadEntity } from "../../leasing-leads/entities/leasing-lead.entity";
import { LeasingQuoteEntity } from "../../leasing-leads/entities/leasing-quote.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";

export interface LeasingContractApproveRecord {
  action: "submit" | "approve" | "reject" | "void" | "sign" | "archive" | "effective";
  operatorId: string;
  operatorName: string;
  opTime: string;
  fromStatus: string;
  toStatus: string;
  opinion?: string | null;
  rejectReason?: string | null;
  attachments?: unknown[];
}

@Entity("biz_leasing_contract")
@Index("idx_biz_leasing_contract_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_contract_status_entity", ["tenantId", "parkId", "status"])
@Index("idx_biz_leasing_contract_park_tenant_entity", ["tenantId", "parkId", "parkTenantId"])
@Index("uk_biz_leasing_contract_code_entity", ["tenantId", "parkId", "contractCode"], { unique: true, where: "is_deleted = false" })
export class LeasingContractEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "contract_code", type: "varchar", length: 64 })
  contractCode!: string;

  @Column({ name: "contract_name", type: "varchar", length: 200 })
  contractName!: string;

  @Column({ name: "contract_type", type: "varchar", length: 32, nullable: true })
  contractType!: string | null;

  @Column({ name: "park_tenant_id", type: "uuid" })
  parkTenantId!: string;

  @ManyToOne(() => ParkTenantEntity)
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant!: ParkTenantEntity;

  @Column({ name: "source_type", type: "varchar", length: 32, default: "manual" })
  sourceType!: "manual" | "quote" | "renewal" | "change";

  @Column({ name: "source_lead_id", type: "uuid", nullable: true })
  sourceLeadId!: string | null;

  @ManyToOne(() => LeasingLeadEntity, { nullable: true })
  @JoinColumn({ name: "source_lead_id" })
  sourceLead?: LeasingLeadEntity | null;

  @Column({ name: "source_quote_id", type: "uuid", nullable: true })
  sourceQuoteId!: string | null;

  @ManyToOne(() => LeasingQuoteEntity, { nullable: true })
  @JoinColumn({ name: "source_quote_id" })
  sourceQuote?: LeasingQuoteEntity | null;

  @Column({ name: "renewal_from_contract_id", type: "uuid", nullable: true })
  renewalFromContractId!: string | null;

  @ManyToOne(() => LeasingContractEntity, { nullable: true })
  @JoinColumn({ name: "renewal_from_contract_id" })
  renewalFromContract?: LeasingContractEntity | null;

  @Column({ name: "start_date", type: "date" })
  startDate!: string;

  @Column({ name: "end_date", type: "date" })
  endDate!: string;

  @Column({ name: "sign_date", type: "date", nullable: true })
  signDate!: string | null;

  @Column({ name: "effective_date", type: "date", nullable: true })
  effectiveDate!: string | null;

  @Column({ name: "rent_unit_price", type: "numeric", precision: 14, scale: 2, default: 0 })
  rentUnitPrice!: string;

  @Column({ name: "total_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  totalArea!: string;

  @Column({ name: "rent_per_month", type: "numeric", precision: 14, scale: 2, default: 0 })
  rentPerMonth!: string;

  @Column({ name: "total_amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  totalAmount!: string;

  @Column({ name: "deposit_months", type: "numeric", precision: 8, scale: 2, default: 0 })
  depositMonths!: string;

  @Column({ name: "deposit_amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  depositAmount!: string;

  @Column({ name: "free_rent_months", type: "numeric", precision: 8, scale: 2, default: 0 })
  freeRentMonths!: string;

  @Column({ name: "payment_period", type: "varchar", length: 32, nullable: true })
  paymentPeriod!: string | null;

  @Column({ name: "payment_advance_days", type: "integer", default: 0 })
  paymentAdvanceDays!: number;

  @Column({ name: "late_fee_rule", type: "text", nullable: true })
  lateFeeRule!: string | null;

  @Column({ name: "property_fee_unit_price", type: "numeric", precision: 14, scale: 2, default: 0 })
  propertyFeeUnitPrice!: string;

  @Column({ name: "other_fee_rules", type: "jsonb", default: [] })
  otherFeeRules!: unknown[];

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;

  @Column({ name: "approve_records", type: "jsonb", default: [] })
  approveRecords!: LeasingContractApproveRecord[];

  @Column({ name: "contract_pdf_file_id", type: "uuid", nullable: true })
  contractPdfFileId!: string | null;

  @ManyToOne(() => FileEntity, { nullable: true })
  @JoinColumn({ name: "contract_pdf_file_id" })
  contractPdfFile?: FileEntity | null;

  @Column({ name: "scan_pdf_file_id", type: "uuid", nullable: true })
  scanPdfFileId!: string | null;

  @ManyToOne(() => FileEntity, { nullable: true })
  @JoinColumn({ name: "scan_pdf_file_id" })
  scanPdfFile?: FileEntity | null;
}
