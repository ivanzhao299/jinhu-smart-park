import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { RolePermissionEntity } from "../../permissions/entities/role-permission.entity";
import { UserRoleEntity } from "./user-role.entity";

@Entity("sys_role")
@Index("idx_sys_role_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_role_entity_tenant_deleted", ["tenantId", "isDeleted"])
export class RoleEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64 })
  code!: string;

  @Column({ name: "name", type: "varchar", length: 100 })
  name!: string;

  @Column({ name: "parent_id", type: "uuid", nullable: true })
  parentId!: string | null;

  @ManyToOne(() => RoleEntity, (role) => role.children, { nullable: true })
  @JoinColumn({ name: "parent_id" })
  parent!: RoleEntity | null;

  @OneToMany(() => RoleEntity, (role) => role.parent)
  children!: RoleEntity[];

  @Column({ name: "role_path", type: "varchar", length: 500, nullable: true })
  rolePath!: string | null;

  @Column({ name: "role_level", type: "integer", default: 1 })
  roleLevel!: number;

  @Column({ name: "level", type: "integer", default: 1 })
  level!: number;

  @Column({ name: "sort_no", type: "integer", default: 0 })
  sortNo!: number;

  @Column({ name: "role_type", type: "varchar", length: 32, default: "custom" })
  roleType!: string;

  @Column({ name: "role_scope", type: "varchar", length: 32, default: "park" })
  roleScope!: string;

  @Column({ name: "data_scope", type: "varchar", length: 32, default: "50" })
  dataScope!: string;

  @Column({ name: "data_scope_config", type: "jsonb", default: {} })
  dataScopeConfig!: Record<string, unknown>;

  @Column({ name: "is_template", type: "boolean", default: false })
  isTemplate!: boolean;

  @Column({ name: "is_system", type: "boolean", default: false })
  isSystem!: boolean;

  @Column({ name: "is_builtin", type: "boolean", default: false })
  isBuiltin!: boolean;

  @Column({ name: "is_super", type: "boolean", default: false })
  isSuper!: boolean;

  @Column({ name: "editable", type: "boolean", default: true })
  editable!: boolean;

  @Column({ name: "is_editable", type: "boolean", default: true })
  isEditable!: boolean;

  @Column({ name: "is_deletable", type: "boolean", default: true })
  isDeletable!: boolean;

  @Column({ name: "is_enabled", type: "boolean", default: true })
  isEnabled!: boolean;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => UserRoleEntity, (link) => link.role)
  userLinks!: UserRoleEntity[];

  @OneToMany(() => RolePermissionEntity, (link) => link.role)
  permissionLinks!: RolePermissionEntity[];
}
