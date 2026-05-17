import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UnitEntity } from "../../units/entities/unit.entity";
import { LeasingContractEntity } from "./leasing-contract.entity";

@Entity("rel_leasing_contract_unit")
@Index("idx_rel_leasing_contract_unit_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_rel_leasing_contract_unit_contract_entity", ["tenantId", "parkId", "contractId", "status"])
@Index("idx_rel_leasing_contract_unit_unit_period_entity", ["tenantId", "parkId", "unitId", "startDate", "endDate"])
export class LeasingContractUnitEntity extends AuditableEntity {
  @Column({ name: "contract_id", type: "uuid" })
  contractId!: string;

  @ManyToOne(() => LeasingContractEntity)
  @JoinColumn({ name: "contract_id" })
  contract!: LeasingContractEntity;

  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @ManyToOne(() => UnitEntity)
  @JoinColumn({ name: "unit_id" })
  unit!: UnitEntity;

  @Column({ name: "unit_code", type: "varchar", length: 64 })
  unitCode!: string;

  @Column({ name: "unit_name", type: "varchar", length: 100 })
  unitName!: string;

  @Column({ name: "area", type: "numeric", precision: 14, scale: 2 })
  area!: string;

  @Column({ name: "rent_unit_price", type: "numeric", precision: 14, scale: 2 })
  rentUnitPrice!: string;

  @Column({ name: "rent_amount_per_month", type: "numeric", precision: 14, scale: 2 })
  rentAmountPerMonth!: string;

  @Column({ name: "start_date", type: "date" })
  startDate!: string;

  @Column({ name: "end_date", type: "date" })
  endDate!: string;

  @Column({ name: "status", type: "smallint", default: 1 })
  status!: number;
}
