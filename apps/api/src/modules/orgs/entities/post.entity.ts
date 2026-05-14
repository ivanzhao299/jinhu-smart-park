import { Column, Entity, Index, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UserOrgEntity } from "./user-org.entity";

@Entity("sys_post")
@Index("idx_sys_post_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_post_scope_code", ["tenantId", "parkId", "postCode"], { unique: true, where: "is_deleted = false" })
export class PostEntity extends AuditableEntity {
  @Column({ name: "post_code", type: "varchar", length: 64 })
  postCode!: string;

  @Column({ name: "post_name", type: "varchar", length: 100 })
  postName!: string;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => UserOrgEntity, (link) => link.post)
  userLinks!: UserOrgEntity[];
}
