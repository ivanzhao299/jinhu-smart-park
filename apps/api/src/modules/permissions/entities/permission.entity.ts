import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { RolePermissionEntity } from "./role-permission.entity";

@Entity("sys_permission")
@Index("idx_sys_permission_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
export class PermissionEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 128 })
  code!: string;

  @Column({ name: "name", type: "varchar", length: 100 })
  name!: string;

  @Column({ name: "parent_id", type: "uuid", nullable: true })
  parentId!: string | null;

  @ManyToOne(() => PermissionEntity, (permission) => permission.children, { nullable: true })
  @JoinColumn({ name: "parent_id" })
  parent!: PermissionEntity | null;

  @OneToMany(() => PermissionEntity, (permission) => permission.parent)
  children!: PermissionEntity[];

  @Column({ name: "resource", type: "varchar", length: 128 })
  resource!: string;

  @Column({ name: "action", type: "varchar", length: 64 })
  action!: string;

  @Column({ name: "permission_path", type: "varchar", length: 500, nullable: true })
  permissionPath!: string | null;

  @Column({ name: "perm_path", type: "varchar", length: 500, nullable: true })
  permPath!: string | null;

  @Column({ name: "permission_level", type: "integer", default: 1 })
  permissionLevel!: number;

  @Column({ name: "level", type: "integer", default: 1 })
  level!: number;

  @Column({ name: "sort_no", type: "integer", default: 0 })
  sortNo!: number;

  @Column({ name: "permission_type", type: "varchar", length: 32, default: "api" })
  permissionType!: string;

  @Column({ name: "perm_type", type: "integer", default: 40 })
  permType!: number;

  @Column({ name: "api_method", type: "varchar", length: 16, nullable: true })
  apiMethod!: string | null;

  @Column({ name: "api_path", type: "varchar", length: 255, nullable: true })
  apiPath!: string | null;

  @Column({ name: "frontend_route", type: "varchar", length: 255, nullable: true })
  frontendRoute!: string | null;

  @Column({ name: "component_key", type: "varchar", length: 128, nullable: true })
  componentKey!: string | null;

  @Column({ name: "field_key", type: "varchar", length: 128, nullable: true })
  fieldKey!: string | null;

  @Column({ name: "data_dimension", type: "varchar", length: 128, nullable: true })
  dataDimension!: string | null;

  @Column({ name: "is_system", type: "boolean", default: true })
  isSystem!: boolean;

  @Column({ name: "is_builtin", type: "boolean", default: true })
  isBuiltin!: boolean;

  @Column({ name: "is_tenant_custom", type: "boolean", default: false })
  isTenantCustom!: boolean;

  @Column({ name: "visible", type: "boolean", default: true })
  visible!: boolean;

  @Column({ name: "is_enabled", type: "boolean", default: true })
  isEnabled!: boolean;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => RolePermissionEntity, (link) => link.permission)
  roleLinks!: RolePermissionEntity[];
}
