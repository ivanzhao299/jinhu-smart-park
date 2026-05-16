import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";

@Entity("biz_park_tenant")
@Index("idx_biz_park_tenant_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_park_tenant_entity_code", ["tenantId", "parkId", "parkTenantCode"], { unique: true, where: "is_deleted = false" })
export class ParkTenantEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "park_tenant_code", type: "varchar", length: 64 })
  parkTenantCode!: string;

  @Column({ name: "company_name", type: "varchar", length: 200 })
  companyName!: string;

  @Column({ name: "unified_credit_code", type: "varchar", length: 32, nullable: true })
  unifiedCreditCode!: string | null;

  @Column({ name: "legal_person", type: "varchar", length: 100, nullable: true })
  legalPerson!: string | null;

  @Column({ name: "legal_person_id", type: "varchar", length: 32, nullable: true })
  legalPersonId!: string | null;

  @Column({ name: "contact_name", type: "varchar", length: 100, nullable: true })
  contactName!: string | null;

  @Column({ name: "contact_mobile", type: "varchar", length: 32, nullable: true })
  contactMobile!: string | null;

  @Column({ name: "contact_email", type: "varchar", length: 120, nullable: true })
  contactEmail!: string | null;

  @Column({ name: "industry_code", type: "varchar", length: 64, nullable: true })
  industryCode!: string | null;

  @Column({ name: "industry_detail", type: "varchar", length: 200, nullable: true })
  industryDetail!: string | null;

  @Column({ name: "business_scope", type: "text", nullable: true })
  businessScope!: string | null;

  @Column({ name: "tenant_type", type: "varchar", length: 32, nullable: true })
  tenantType!: string | null;

  @Column({ name: "risk_level", type: "varchar", length: 32, nullable: true })
  riskLevel!: string | null;

  @Column({ name: "risk_tags", type: "jsonb", default: [] })
  riskTags!: string[];

  @Column({ name: "check_in_date", type: "date", nullable: true })
  checkInDate!: string | null;

  @Column({ name: "check_out_date", type: "date", nullable: true })
  checkOutDate!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;

  @Column({ name: "source_type", type: "varchar", length: 32, default: "manual" })
  sourceType!: string;

  @Column({ name: "create_by", type: "varchar", length: 64, nullable: true })
  createBy!: string | null;

  @CreateDateColumn({ name: "create_time", type: "timestamptz" })
  createTime!: Date;

  @Column({ name: "update_by", type: "varchar", length: 64, nullable: true })
  updateBy!: string | null;

  @UpdateDateColumn({ name: "update_time", type: "timestamptz" })
  updateTime!: Date;

  @Column({ name: "is_deleted", type: "boolean", default: false })
  isDeleted!: boolean;

  @VersionColumn({ name: "version" })
  version!: number;

  @Column({ name: "remark", type: "varchar", length: 500, nullable: true })
  remark!: string | null;
}
