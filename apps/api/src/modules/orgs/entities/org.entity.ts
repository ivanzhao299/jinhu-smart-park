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

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => UserOrgEntity, (link) => link.org)
  userLinks!: UserOrgEntity[];
}
