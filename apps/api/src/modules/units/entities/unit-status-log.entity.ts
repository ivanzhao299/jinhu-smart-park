import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";
import { UnitEntity } from "./unit.entity";

@Entity("biz_unit_status_log")
@Index("idx_biz_unit_status_log_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_unit_status_log_entity_unit_time", ["tenantId", "parkId", "unitId", "opTime"])
export class UnitStatusLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @ManyToOne(() => UnitEntity, { eager: false })
  @JoinColumn({ name: "unit_id" })
  unit!: UnitEntity;

  @Column({ name: "before_status", type: "smallint" })
  beforeStatus!: number;

  @Column({ name: "after_status", type: "smallint" })
  afterStatus!: number;

  @Column({ name: "reason", type: "varchar", length: 500 })
  reason!: string;

  @Column({ name: "source_type", type: "varchar", length: 32, default: "manual" })
  sourceType!: "manual" | "contract" | "import" | "system";

  @Column({ name: "operator_id", type: "varchar", length: 64, nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 100, nullable: true })
  operatorName!: string | null;

  @Column({ name: "op_time", type: "timestamptz" })
  opTime!: Date;

  @Column({ name: "create_by", type: "varchar", length: 64, nullable: true })
  createBy!: string | null;

  @CreateDateColumn({ name: "create_time", type: "timestamptz" })
  createTime!: Date;

  @Column({ name: "update_by", type: "varchar", length: 64, nullable: true })
  updateBy!: string | null;

  @UpdateDateColumn({ name: "update_time", type: "timestamptz" })
  updateTime!: Date;

  @Column({ name: "is_deleted", type: "boolean", default: false })
  isDeleted!: boolean;

  @VersionColumn({ name: "version" })
  version!: number;

  @Column({ name: "remark", type: "varchar", length: 500, nullable: true })
  remark!: string | null;
}
