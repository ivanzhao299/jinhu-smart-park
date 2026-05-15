import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { RoleEntity } from "../../roles/entities/role.entity";
import { FieldPolicyEntity } from "./field-policy.entity";

@Entity("rel_role_field_policy")
@Index("idx_rel_role_field_policy_entity_role", ["tenantId", "roleId", "isDeleted"])
@Index("idx_rel_role_field_policy_entity_policy", ["tenantId", "fieldPolicyId", "isDeleted"])
export class RoleFieldPolicyEntity extends AuditableEntity {
  @Column({ name: "role_id", type: "uuid" })
  roleId!: string;

  @Column({ name: "field_policy_id", type: "uuid" })
  fieldPolicyId!: string;

  @ManyToOne(() => RoleEntity)
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity;

  @ManyToOne(() => FieldPolicyEntity, (policy) => policy.roleLinks)
  @JoinColumn({ name: "field_policy_id" })
  fieldPolicy!: FieldPolicyEntity;
}
