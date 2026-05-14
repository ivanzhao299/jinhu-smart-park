import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { RoleEntity } from "../../roles/entities/role.entity";
import { PermissionEntity } from "./permission.entity";

@Entity("rel_role_perm")
@Index("idx_rel_role_perm_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
export class RolePermissionEntity extends AuditableEntity {
  @Column({ name: "role_id", type: "uuid" })
  roleId!: string;

  @Column({ name: "permission_id", type: "uuid" })
  permissionId!: string;

  @ManyToOne(() => RoleEntity, (role) => role.permissionLinks)
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity;

  @ManyToOne(() => PermissionEntity, (permission) => permission.roleLinks)
  @JoinColumn({ name: "permission_id" })
  permission!: PermissionEntity;
}
