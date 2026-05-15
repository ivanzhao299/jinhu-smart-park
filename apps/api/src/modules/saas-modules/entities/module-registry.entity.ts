import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("sys_module_registry")
@Index("idx_sys_module_registry_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_module_registry_entity_code", ["tenantId", "parkId", "moduleCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class ModuleRegistryEntity extends AuditableEntity {
  @Column({ name: "module_code", type: "varchar", length: 64 })
  moduleCode!: string;

  @Column({ name: "module_name", type: "varchar", length: 100 })
  moduleName!: string;

  @Column({ name: "module_group", type: "varchar", length: 64 })
  moduleGroup!: string;

  @Column({ name: "module_version", type: "varchar", length: 32, default: "1.0.0" })
  moduleVersion!: string;

  @Column({ name: "route_path", type: "varchar", length: 255, nullable: true })
  routePath!: string | null;

  @Column({ name: "permission_code", type: "varchar", length: 128, nullable: true })
  permissionCode!: string | null;

  @Column({ name: "icon_key", type: "varchar", length: 64, nullable: true })
  iconKey!: string | null;

  @Column({ name: "sort_no", type: "integer", default: 0 })
  sortNo!: number;

  @Column({ name: "is_builtin", type: "boolean", default: true })
  isBuiltin!: boolean;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
