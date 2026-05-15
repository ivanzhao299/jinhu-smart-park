import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";
import { PlanEntity } from "./plan.entity";
import { SaaSModuleEntity } from "./saas-module.entity";

@Entity("rel_plan_module")
@Index("idx_rel_plan_module_entity_unique", ["planId", "moduleId"], {
  unique: true,
  where: "is_deleted = false"
})
export class PlanModuleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "plan_id", type: "uuid" })
  planId!: string;

  @ManyToOne(() => PlanEntity)
  @JoinColumn({ name: "plan_id" })
  plan!: PlanEntity;

  @Column({ name: "module_id", type: "uuid" })
  moduleId!: string;

  @ManyToOne(() => SaaSModuleEntity)
  @JoinColumn({ name: "module_id" })
  module!: SaaSModuleEntity;

  @Column({ name: "status", type: "integer", default: 1 })
  status!: number;

  @CreateDateColumn({ name: "create_time", type: "timestamptz" })
  createTime!: Date;

  @UpdateDateColumn({ name: "update_time", type: "timestamptz" })
  updateTime!: Date;

  @Column({ name: "is_deleted", type: "boolean", default: false })
  isDeleted!: boolean;

  @VersionColumn({ name: "version" })
  version!: number;

  @Column({ name: "remark", type: "varchar", length: 500, nullable: true })
  remark!: string | null;
}
