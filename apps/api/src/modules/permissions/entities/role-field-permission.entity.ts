import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { RoleEntity } from "../../roles/entities/role.entity";

@Entity("rel_role_field_perm")
@Index("idx_rel_role_field_perm_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_rel_role_field_perm_entity_role", ["tenantId", "parkId", "roleId"])
export class RoleFieldPermissionEntity extends AuditableEntity {
  @Column({ name: "role_id", type: "uuid" })
  roleId!: string;

  @ManyToOne(() => RoleEntity)
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity;

  @Column({ name: "resource", type: "varchar", length: 128 })
  resource!: string;

  @Column({ name: "field_key", type: "varchar", length: 128 })
  fieldKey!: string;

  @Column({ name: "field_name", type: "varchar", length: 100 })
  fieldName!: string;

  @Column({ name: "access_mode", type: "varchar", length: 32, default: "read" })
  accessMode!: "none" | "read" | "write" | "mask";
}
