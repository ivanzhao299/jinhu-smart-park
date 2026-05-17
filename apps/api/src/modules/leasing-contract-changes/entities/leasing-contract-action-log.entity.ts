import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { LeasingContractEntity } from "../../leasing-contracts/entities/leasing-contract.entity";
import { LeasingContractChangeEntity } from "./leasing-contract-change.entity";

@Entity("biz_leasing_contract_action_log")
@Index("idx_biz_leasing_contract_action_log_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_contract_action_log_contract_entity", ["tenantId", "parkId", "contractId", "opTime"])
@Index("idx_biz_leasing_contract_action_log_change_entity", ["tenantId", "parkId", "changeId", "opTime"])
@Index("idx_biz_leasing_contract_action_log_biz_entity", ["tenantId", "parkId", "bizType", "bizId", "opTime"])
export class LeasingContractActionLogEntity extends AuditableEntity {
  @Column({ name: "contract_id", type: "uuid" })
  contractId!: string;

  @ManyToOne(() => LeasingContractEntity)
  @JoinColumn({ name: "contract_id" })
  contract!: LeasingContractEntity;

  @Column({ name: "change_id", type: "uuid", nullable: true })
  changeId!: string | null;

  @ManyToOne(() => LeasingContractChangeEntity, { nullable: true })
  @JoinColumn({ name: "change_id" })
  change?: LeasingContractChangeEntity | null;

  @Column({ name: "biz_type", type: "varchar", length: 32, default: "contract" })
  bizType!: "contract_change" | "renewal" | "checkout" | "refund" | "contract";

  @Column({ name: "biz_id", type: "uuid", nullable: true })
  bizId!: string | null;

  @Column({ name: "before_status", type: "varchar", length: 32, nullable: true })
  beforeStatus!: string | null;

  @Column({ name: "after_status", type: "varchar", length: 32, nullable: true })
  afterStatus!: string | null;

  @Column({ name: "action", type: "varchar", length: 32 })
  action!:
    | "create"
    | "submit"
    | "approve"
    | "reject"
    | "sign"
    | "archive"
    | "effective"
    | "void"
    | "preview"
    | "preview_finance"
    | "preview_settlement"
    | "confirm_settlement"
    | "settlement"
    | "refund"
    | "cancel"
    | "system";

  @Column({ name: "reason", type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ name: "operator_id", type: "varchar", length: 64, nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 100, nullable: true })
  operatorName!: string | null;

  @Column({ name: "op_time", type: "timestamptz", default: () => "now()" })
  opTime!: Date;
}
