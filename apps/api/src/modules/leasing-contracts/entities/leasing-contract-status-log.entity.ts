import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { LeasingContractEntity } from "./leasing-contract.entity";

@Entity("biz_leasing_contract_status_log")
@Index("idx_biz_leasing_contract_status_log_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_contract_status_log_contract_time_entity", ["tenantId", "parkId", "contractId", "opTime"])
export class LeasingContractStatusLogEntity extends AuditableEntity {
  @Column({ name: "contract_id", type: "uuid" })
  contractId!: string;

  @ManyToOne(() => LeasingContractEntity)
  @JoinColumn({ name: "contract_id" })
  contract!: LeasingContractEntity;

  @Column({ name: "before_status", type: "varchar", length: 32, nullable: true })
  beforeStatus!: string | null;

  @Column({ name: "after_status", type: "varchar", length: 32 })
  afterStatus!: string;

  @Column({ name: "action", type: "varchar", length: 32, default: "system" })
  action!: "create" | "submit" | "approve" | "reject" | "archive" | "effective" | "terminate" | "void" | "sign" | "system";

  @Column({ name: "reason", type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ name: "operator_id", type: "uuid", nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 100, nullable: true })
  operatorName!: string | null;

  @Column({ name: "op_time", type: "timestamptz" })
  opTime!: Date;
}
