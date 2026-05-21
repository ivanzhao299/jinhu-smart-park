import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { BuildingEntity } from "../../buildings/entities/building.entity";
import { FloorEntity } from "../../floors/entities/floor.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../../units/entities/unit.entity";
import { WorkOrderEntity } from "../../work-orders/entities/work-order.entity";

@Entity("biz_safety_hazard")
@Index("idx_biz_safety_hazard_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_hazard_source", ["tenantId", "parkId", "sourceType", "sourceId", "isDeleted"])
@Index("idx_biz_safety_hazard_status", ["tenantId", "parkId", "status", "isDeleted"])
@Index("uk_biz_safety_hazard_code", ["tenantId", "parkId", "hazardCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class SafetyHazardEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "hazard_code", type: "varchar", length: 64 })
  hazardCode!: string;

  @Column({ name: "title", type: "varchar", length: 200 })
  title!: string;

  /**
   * Compatibility with the initial S5-A inspect-task migration.
   * New code uses title; this column is kept populated until the old column can be retired.
   */
  @Column({ name: "hazard_title", type: "varchar", length: 200 })
  hazardTitle!: string;

  @Column({ name: "hazard_type", type: "varchar", length: 64, nullable: true })
  hazardType!: string | null;

  @Column({ name: "risk_level", type: "varchar", length: 32, nullable: true })
  riskLevel!: string | null;

  @Column({ name: "source_type", type: "varchar", length: 32 })
  sourceType!: string;

  @Column({ name: "source_id", type: "uuid", nullable: true })
  sourceId!: string | null;

  @Column({ name: "inspect_task_id", type: "uuid", nullable: true })
  inspectTaskId!: string | null;

  @Column({ name: "inspect_point_id", type: "uuid", nullable: true })
  inspectPointId!: string | null;

  @Column({ name: "park_tenant_id", type: "uuid", nullable: true })
  parkTenantId!: string | null;

  @ManyToOne(() => ParkTenantEntity, { nullable: true })
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant?: ParkTenantEntity | null;

  @Column({ name: "building_id", type: "uuid", nullable: true })
  buildingId!: string | null;

  @ManyToOne(() => BuildingEntity, { nullable: true })
  @JoinColumn({ name: "building_id" })
  building?: BuildingEntity | null;

  @Column({ name: "floor_id", type: "uuid", nullable: true })
  floorId!: string | null;

  @ManyToOne(() => FloorEntity, { nullable: true })
  @JoinColumn({ name: "floor_id" })
  floor?: FloorEntity | null;

  @Column({ name: "unit_id", type: "uuid", nullable: true })
  unitId!: string | null;

  @ManyToOne(() => UnitEntity, { nullable: true })
  @JoinColumn({ name: "unit_id" })
  unit?: UnitEntity | null;

  @Column({ name: "location", type: "varchar", length: 300 })
  location!: string;

  @Column({ name: "description", type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "photo_file_ids", type: "uuid", array: true, default: () => "ARRAY[]::uuid[]" })
  photoFileIds!: string[];

  @Column({ name: "before_photo_file_ids", type: "uuid", array: true, default: () => "ARRAY[]::uuid[]" })
  beforePhotoFileIds!: string[];

  @Column({ name: "after_photo_file_ids", type: "uuid", array: true, default: () => "ARRAY[]::uuid[]" })
  afterPhotoFileIds!: string[];

  @Column({ name: "rectify_user_id", type: "uuid", nullable: true })
  rectifyUserId!: string | null;

  @Column({ name: "rectify_user_name", type: "varchar", length: 100, nullable: true })
  rectifyUserName!: string | null;

  @Column({ name: "rectify_deadline", type: "timestamptz", nullable: true })
  rectifyDeadline!: Date | null;

  @Column({ name: "rectify_time", type: "timestamptz", nullable: true })
  rectifyTime!: Date | null;

  @Column({ name: "recheck_user_id", type: "uuid", nullable: true })
  recheckUserId!: string | null;

  @Column({ name: "recheck_user_name", type: "varchar", length: 100, nullable: true })
  recheckUserName!: string | null;

  @Column({ name: "recheck_time", type: "timestamptz", nullable: true })
  recheckTime!: Date | null;

  @Column({ name: "recheck_result", type: "varchar", length: 64, nullable: true })
  recheckResult!: string | null;

  @Column({ name: "overdue_flag", type: "boolean", default: false })
  overdueFlag!: boolean;

  @Column({ name: "upgrade_flag", type: "boolean", default: false })
  upgradeFlag!: boolean;

  @Column({ name: "work_order_id", type: "uuid", nullable: true })
  workOrderId!: string | null;

  @ManyToOne(() => WorkOrderEntity, { nullable: true })
  @JoinColumn({ name: "work_order_id" })
  workOrder?: WorkOrderEntity | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;
}
