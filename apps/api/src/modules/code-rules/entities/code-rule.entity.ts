import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("sys_code_rule")
@Index("idx_sys_code_rule_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_code_rule_entity_code", ["tenantId", "parkId", "ruleCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class CodeRuleEntity extends AuditableEntity {
  @Column({ name: "entity_type", type: "varchar", length: 64, nullable: true })
  entityType!: string | null;

  @Column({ name: "rule_code", type: "varchar", length: 64 })
  ruleCode!: string;

  @Column({ name: "rule_name", type: "varchar", length: 100 })
  ruleName!: string;

  @Column({ name: "target_module", type: "varchar", length: 64 })
  targetModule!: string;

  @Column({ name: "target_entity", type: "varchar", length: 64 })
  targetEntity!: string;

  @Column({ name: "prefix", type: "varchar", length: 32 })
  prefix!: string;

  @Column({ name: "pattern", type: "varchar", length: 128, default: "{PREFIX}{SEQ:6}" })
  pattern!: string;

  @Column({ name: "date_pattern", type: "varchar", length: 32, nullable: true })
  datePattern!: string | null;

  @Column({ name: "sequence_length", type: "integer", default: 6 })
  sequenceLength!: number;

  @Column({ name: "current_sequence", type: "integer", default: 0 })
  currentSequence!: number;

  @Column({ name: "current_seq", type: "integer", default: 0 })
  currentSeq!: number;

  @Column({ name: "reset_strategy", type: "varchar", length: 32, default: "daily" })
  resetStrategy!: string;

  @Column({ name: "reset_policy", type: "varchar", length: 32, default: "none" })
  resetPolicy!: string;

  @Column({ name: "next_reset_time", type: "timestamptz", nullable: true })
  nextResetTime!: Date | null;

  @Column({ name: "separator", type: "varchar", length: 8, default: "" })
  separator!: string;

  @Column({ name: "sample_code", type: "varchar", length: 128, nullable: true })
  sampleCode!: string | null;

  @Column({ name: "example_code", type: "varchar", length: 128, nullable: true })
  exampleCode!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
