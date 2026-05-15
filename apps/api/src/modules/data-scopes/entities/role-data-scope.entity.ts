import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { RoleEntity } from "../../roles/entities/role.entity";
import { DataScopeRuleEntity } from "./data-scope-rule.entity";

@Entity("rel_role_data_scope")
@Index("idx_rel_role_data_scope_entity_role", ["tenantId", "roleId", "isDeleted"])
@Index("idx_rel_role_data_scope_entity_rule", ["tenantId", "ruleId", "isDeleted"])
export class RoleDataScopeEntity extends AuditableEntity {
  @Column({ name: "role_id", type: "uuid" })
  roleId!: string;

  @Column({ name: "rule_id", type: "uuid" })
  ruleId!: string;

  @ManyToOne(() => RoleEntity)
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity;

  @ManyToOne(() => DataScopeRuleEntity, (rule) => rule.roleLinks)
  @JoinColumn({ name: "rule_id" })
  rule!: DataScopeRuleEntity;
}
