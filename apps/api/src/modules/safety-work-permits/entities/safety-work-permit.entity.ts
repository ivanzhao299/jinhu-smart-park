import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { BuildingEntity } from "../../buildings/entities/building.entity";
import { FloorEntity } from "../../floors/entities/floor.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../../units/entities/unit.entity";

@Entity("biz_safety_work_permit")
@Index("idx_biz_safety_work_permit_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_work_permit_status", ["tenantId", "parkId", "status", "isDeleted"])
@Index("idx_biz_safety_work_permit_type", ["tenantId", "parkId", "permitType", "isDeleted"])
@Index("idx_biz_safety_work_permit_unit", ["tenantId", "parkId", "unitId", "isDeleted"])
@Index("idx_biz_safety_work_permit_tenant_company", ["tenantId", "parkId", "applyParkTenantId", "isDeleted"])
@Index("uk_biz_safety_work_permit_code", ["tenantId", "parkId", "permitCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class SafetyWorkPermitEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "permit_code", type: "varchar", length: 64 })
  permitCode!: string;

  @Column({ name: "permit_type", type: "varchar", length: 64 })
  permitType!: string;

  @Column({ name: "apply_type", type: "varchar", length: 64, nullable: true })
  applyType!: string | null;

  @Column({ name: "apply_user_id", type: "uuid", nullable: true })
  applyUserId!: string | null;

  @Column({ name: "apply_user_name", type: "varchar", length: 100, nullable: true })
  applyUserName!: string | null;

  @Column({ name: "apply_mobile", type: "varchar", length: 32, nullable: true })
  applyMobile!: string | null;

  @Column({ name: "apply_park_tenant_id", type: "uuid", nullable: true })
  applyParkTenantId!: string | null;

  @ManyToOne(() => ParkTenantEntity, { eager: false, nullable: true })
  @JoinColumn({ name: "apply_park_tenant_id" })
  applyParkTenant!: ParkTenantEntity | null;

  @Column({ name: "contractor_name", type: "varchar", length: 200, nullable: true })
  contractorName!: string | null;

  @Column({ name: "contractor_contact", type: "varchar", length: 100, nullable: true })
  contractorContact!: string | null;

  @Column({ name: "contractor_mobile", type: "varchar", length: 32, nullable: true })
  contractorMobile!: string | null;

  @Column({ name: "building_id", type: "uuid", nullable: true })
  buildingId!: string | null;

  @ManyToOne(() => BuildingEntity, { eager: false, nullable: true })
  @JoinColumn({ name: "building_id" })
  building!: BuildingEntity | null;

  @Column({ name: "floor_id", type: "uuid", nullable: true })
  floorId!: string | null;

  @ManyToOne(() => FloorEntity, { eager: false, nullable: true })
  @JoinColumn({ name: "floor_id" })
  floor!: FloorEntity | null;

  @Column({ name: "unit_id", type: "uuid", nullable: true })
  unitId!: string | null;

  @ManyToOne(() => UnitEntity, { eager: false, nullable: true })
  @JoinColumn({ name: "unit_id" })
  unit!: UnitEntity | null;

  @Column({ name: "location", type: "varchar", length: 500 })
  location!: string;

  @Column({ name: "time_start", type: "timestamptz" })
  timeStart!: Date;

  @Column({ name: "time_end", type: "timestamptz" })
  timeEnd!: Date;

  @Column({ name: "risk_level", type: "varchar", length: 32 })
  riskLevel!: string;

  @Column({ name: "protective_measures", type: "text", nullable: true })
  protectiveMeasures!: string | null;

  @Column({ name: "monitor_user_id", type: "uuid", nullable: true })
  monitorUserId!: string | null;

  @Column({ name: "monitor_user_name", type: "varchar", length: 100, nullable: true })
  monitorUserName!: string | null;

  @Column({ name: "approve_records", type: "jsonb", default: () => "'[]'::jsonb" })
  approveRecords!: Record<string, unknown>[];

  @Column({ name: "start_check_photo_file_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  startCheckPhotoFileIds!: string[];

  @Column({ name: "end_check_photo_file_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  endCheckPhotoFileIds!: string[];

  @Column({ name: "process_check_count", type: "integer", default: 0 })
  processCheckCount!: number;

  @Column({ name: "violation_count", type: "integer", default: 0 })
  violationCount!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;

  @Column({ name: "submit_time", type: "timestamptz", nullable: true })
  submitTime!: Date | null;

  @Column({ name: "approve_time", type: "timestamptz", nullable: true })
  approveTime!: Date | null;

  @Column({ name: "start_time", type: "timestamptz", nullable: true })
  startTime!: Date | null;

  @Column({ name: "finish_time", type: "timestamptz", nullable: true })
  finishTime!: Date | null;

  @Column({ name: "close_time", type: "timestamptz", nullable: true })
  closeTime!: Date | null;

  @Column({ name: "reject_reason", type: "varchar", length: 500, nullable: true })
  rejectReason!: string | null;
}
