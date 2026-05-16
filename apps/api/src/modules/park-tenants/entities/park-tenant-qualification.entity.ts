import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";
import { FileEntity } from "../../files/entities/file.entity";
import { ParkTenantEntity } from "./park-tenant.entity";

@Entity("biz_park_tenant_qualification")
@Index("idx_biz_park_tenant_qualification_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_park_tenant_qualification_entity_parent", ["tenantId", "parkId", "parkTenantId", "isDeleted"])
export class ParkTenantQualificationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "park_tenant_id", type: "uuid" })
  parkTenantId!: string;

  @ManyToOne(() => ParkTenantEntity)
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant!: ParkTenantEntity;

  @Column({ name: "qualification_type", type: "varchar", length: 64 })
  qualificationType!: string;

  @Column({ name: "qualification_name", type: "varchar", length: 200 })
  qualificationName!: string;

  @Column({ name: "certificate_no", type: "varchar", length: 100, nullable: true })
  certificateNo!: string | null;

  @Column({ name: "issue_date", type: "date", nullable: true })
  issueDate!: string | null;

  @Column({ name: "expire_date", type: "date", nullable: true })
  expireDate!: string | null;

  @Column({ name: "file_id", type: "uuid", nullable: true })
  fileId!: string | null;

  @ManyToOne(() => FileEntity)
  @JoinColumn({ name: "file_id" })
  file!: FileEntity | null;

  @Column({ name: "status", type: "integer", default: 1 })
  status!: number;

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
