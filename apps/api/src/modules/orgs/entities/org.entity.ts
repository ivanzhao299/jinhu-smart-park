import { Column, Entity, Index, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UserOrgEntity } from "./user-org.entity";

@Entity("sys_org")
@Index("idx_sys_org_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_org_scope_code", ["tenantId", "parkId", "orgCode"], { unique: true, where: "is_deleted = false" })
export class OrgEntity extends AuditableEntity {
  @Column({ name: "parent_id", type: "uuid", nullable: true })
  parentId!: string | null;

  @Column({ name: "org_code", type: "varchar", length: 64 })
  orgCode!: string;

  @Column({ name: "org_name", type: "varchar", length: 100 })
  orgName!: string;

  @Column({ name: "org_type", type: "varchar", length: 32 })
  orgType!: string;

  @Column({ name: "leader_user_id", type: "uuid", nullable: true })
  leaderUserId!: string | null;

  @Column({ name: "legacy_source_id", type: "integer", nullable: true })
  legacySourceId!: number | null;

  @Column({ name: "legacy_hierarchy_level", type: "smallint", nullable: true })
  legacyHierarchyLevel!: number | null;

  // Legacy compatibility metadata only. It is not a sys_user identity and is
  // deliberately excluded from normal organization projections.
  @Column({ name: "legacy_manager_reference", type: "varchar", length: 10, nullable: true, select: false })
  legacyManagerReference!: string | null;

  @Column({ name: "planned_headcount", type: "integer", nullable: true })
  plannedHeadcount!: number | null;

  @Column({ name: "contact_phone", type: "varchar", length: 50, nullable: true })
  contactPhone!: string | null;

  @Column({ name: "contact_address", type: "varchar", length: 500, nullable: true })
  contactAddress!: string | null;

  @Column({ name: "contact_email", type: "varchar", length: 254, nullable: true })
  contactEmail!: string | null;

  // This unresolved legacy value is available only to controlled migration
  // tooling. It is neither a sys_user identity nor a normal organization field.
  @Column({ name: "legacy_company_manager_reference", type: "varchar", length: 50, nullable: true, select: false })
  legacyCompanyManagerReference!: string | null;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => UserOrgEntity, (link) => link.org)
  userLinks!: UserOrgEntity[];
}
