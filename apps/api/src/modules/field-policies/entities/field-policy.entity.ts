import { Column, Entity, Index, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { RoleFieldPolicyEntity } from "./role-field-policy.entity";

export type FieldPolicyType = "visible" | "masked" | "hidden" | "readonly" | "editable";

@Entity("sys_field_policy")
@Index("idx_sys_field_policy_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_field_policy_entity_module", ["tenantId", "module", "entity", "status", "isDeleted"])
export class FieldPolicyEntity extends AuditableEntity {
  @Column({ name: "module", type: "varchar", length: 64 })
  module!: string;

  @Column({ name: "entity", type: "varchar", length: 64 })
  entity!: string;

  @Column({ name: "field_key", type: "varchar", length: 128 })
  fieldKey!: string;

  @Column({ name: "field_name", type: "varchar", length: 100 })
  fieldName!: string;

  @Column({ name: "policy_type", type: "varchar", length: 32 })
  policyType!: FieldPolicyType;

  @Column({ name: "mask_rule", type: "varchar", length: 64, nullable: true })
  maskRule!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => RoleFieldPolicyEntity, (link) => link.fieldPolicy)
  roleLinks!: RoleFieldPolicyEntity[];
}
