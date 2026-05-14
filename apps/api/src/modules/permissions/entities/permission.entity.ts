import { Column, Entity, Index, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { RolePermissionEntity } from "./role-permission.entity";

@Entity("sys_permission")
@Index("idx_sys_permission_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
export class PermissionEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 128 })
  code!: string;

  @Column({ name: "name", type: "varchar", length: 100 })
  name!: string;

  @Column({ name: "resource", type: "varchar", length: 128 })
  resource!: string;

  @Column({ name: "action", type: "varchar", length: 64 })
  action!: string;

  @Column({ name: "is_enabled", type: "boolean", default: true })
  isEnabled!: boolean;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => RolePermissionEntity, (link) => link.permission)
  roleLinks!: RolePermissionEntity[];
}
