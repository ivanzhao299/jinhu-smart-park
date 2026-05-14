import { Column, Entity, Index, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { RolePermissionEntity } from "../../permissions/entities/role-permission.entity";
import { UserRoleEntity } from "./user-role.entity";

@Entity("sys_role")
@Index("idx_sys_role_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
export class RoleEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64 })
  code!: string;

  @Column({ name: "name", type: "varchar", length: 100 })
  name!: string;

  @Column({ name: "is_enabled", type: "boolean", default: true })
  isEnabled!: boolean;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => UserRoleEntity, (link) => link.role)
  userLinks!: UserRoleEntity[];

  @OneToMany(() => RolePermissionEntity, (link) => link.role)
  permissionLinks!: RolePermissionEntity[];
}
