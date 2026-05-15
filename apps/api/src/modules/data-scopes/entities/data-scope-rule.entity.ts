import { Column, Entity, Index, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { RoleDataScopeEntity } from "./role-data-scope.entity";

export type DataScopeDimension =
  | "tenant"
  | "park"
  | "org"
  | "building"
  | "floor"
  | "unit"
  | "tenant_company"
  | "customer_owner"
  | "contract_owner"
  | "workorder_handler";

export type DataScopeType = "all" | "tenant" | "park" | "org" | "org_and_children" | "self" | "assigned" | "custom";

export interface DataScopeConfig {
  ids?: string[];
  orgIds?: string[];
  buildingIds?: string[];
  floorIds?: string[];
  unitIds?: string[];
  tenantCompanyIds?: string[];
  userIds?: string[];
}

@Entity("sys_data_scope_rule")
@Index("idx_sys_data_scope_rule_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_data_scope_rule_entity_dimension", ["tenantId", "dimension", "scopeType", "isDeleted"])
export class DataScopeRuleEntity extends AuditableEntity {
  @Column({ name: "rule_code", type: "varchar", length: 128 })
  ruleCode!: string;

  @Column({ name: "rule_name", type: "varchar", length: 100 })
  ruleName!: string;

  @Column({ name: "dimension", type: "varchar", length: 64 })
  dimension!: DataScopeDimension;

  @Column({ name: "scope_type", type: "varchar", length: 64 })
  scopeType!: DataScopeType;

  @Column({ name: "scope_config", type: "jsonb", default: {} })
  scopeConfig!: DataScopeConfig;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => RoleDataScopeEntity, (link) => link.rule)
  roleLinks!: RoleDataScopeEntity[];
}
