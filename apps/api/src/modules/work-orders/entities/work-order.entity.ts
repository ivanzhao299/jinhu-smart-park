import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { BuildingEntity } from "../../buildings/entities/building.entity";
import { FloorEntity } from "../../floors/entities/floor.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../../units/entities/unit.entity";

@Entity("biz_work_order")
@Index("idx_biz_work_order_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_work_order_entity_status", ["tenantId", "parkId", "status", "isDeleted"])
@Index("idx_biz_work_order_entity_assignee", ["tenantId", "parkId", "assigneeId", "isDeleted"])
@Index("idx_biz_work_order_entity_park_tenant", ["tenantId", "parkId", "parkTenantId", "isDeleted"])
@Index("idx_biz_work_order_entity_unit", ["tenantId", "parkId", "unitId", "isDeleted"])
@Index("idx_biz_work_order_entity_source", ["tenantId", "parkId", "sourceType", "sourceId", "isDeleted"])
@Index("uk_biz_work_order_entity_code", ["tenantId", "parkId", "woCode"], { unique: true, where: "is_deleted = false" })
export class WorkOrderEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "wo_code", type: "varchar", length: 64 })
  woCode!: string;

  @Column({ name: "title", type: "varchar", length: 200 })
  title!: string;

  @Column({ name: "wo_type", type: "varchar", length: 64 })
  woType!: string;

  @Column({ name: "wo_sub_type", type: "varchar", length: 64, nullable: true })
  woSubType!: string | null;

  @Column({ name: "priority", type: "varchar", length: 32 })
  priority!: string;

  @Column({ name: "urgency", type: "varchar", length: 32, nullable: true })
  urgency!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;

  @Column({ name: "source_type", type: "varchar", length: 32, default: "manual" })
  sourceType!: string;

  @Column({ name: "source_id", type: "varchar", length: 64, nullable: true })
  sourceId!: string | null;

  @Column({ name: "park_tenant_id", type: "uuid", nullable: true })
  parkTenantId!: string | null;

  @ManyToOne(() => ParkTenantEntity, { nullable: true })
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant?: ParkTenantEntity | null;

  @Column({ name: "unit_id", type: "uuid", nullable: true })
  unitId!: string | null;

  @ManyToOne(() => UnitEntity, { nullable: true })
  @JoinColumn({ name: "unit_id" })
  unit?: UnitEntity | null;

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

  @Column({ name: "room_label", type: "varchar", length: 100, nullable: true })
  roomLabel!: string | null;

  @Column({ name: "location", type: "varchar", length: 300, nullable: true })
  location!: string | null;

  @Column({ name: "reporter_id", type: "uuid", nullable: true })
  reporterId!: string | null;

  @Column({ name: "reporter_name", type: "varchar", length: 100, nullable: true })
  reporterName!: string | null;

  @Column({ name: "reporter_mobile", type: "varchar", length: 32, nullable: true })
  reporterMobile!: string | null;

  @Column({ name: "assignee_id", type: "uuid", nullable: true })
  assigneeId!: string | null;

  @Column({ name: "assignee_name", type: "varchar", length: 100, nullable: true })
  assigneeName!: string | null;

  @Column({ name: "assigner_id", type: "uuid", nullable: true })
  assignerId!: string | null;

  @Column({ name: "assigner_name", type: "varchar", length: 100, nullable: true })
  assignerName!: string | null;

  @Column({ name: "description", type: "text" })
  description!: string;

  @Column({ name: "image_file_ids", type: "uuid", array: true, default: [] })
  imageFileIds!: string[];

  @Column({ name: "video_file_ids", type: "uuid", array: true, default: [] })
  videoFileIds!: string[];

  @Column({ name: "device_id", type: "varchar", length: 64, nullable: true })
  deviceId!: string | null;

  @Column({ name: "robot_id", type: "varchar", length: 64, nullable: true })
  robotId!: string | null;

  @Column({ name: "sla_dispatch_min", type: "integer", nullable: true })
  slaDispatchMin!: number | null;

  @Column({ name: "sla_finish_min", type: "integer", nullable: true })
  slaFinishMin!: number | null;

  @Column({ name: "overdue_flag", type: "boolean", default: false })
  overdueFlag!: boolean;

  @Column({ name: "overdue_reason", type: "varchar", length: 500, nullable: true })
  overdueReason!: string | null;

  @Column({ name: "dispatch_time", type: "timestamptz", nullable: true })
  dispatchTime!: Date | null;

  @Column({ name: "accept_time", type: "timestamptz", nullable: true })
  acceptTime!: Date | null;

  @Column({ name: "start_time", type: "timestamptz", nullable: true })
  startTime!: Date | null;

  @Column({ name: "wait_material_time", type: "timestamptz", nullable: true })
  waitMaterialTime!: Date | null;

  @Column({ name: "finish_time", type: "timestamptz", nullable: true })
  finishTime!: Date | null;

  @Column({ name: "confirm_time", type: "timestamptz", nullable: true })
  confirmTime!: Date | null;

  @Column({ name: "close_time", type: "timestamptz", nullable: true })
  closeTime!: Date | null;

  @Column({ name: "cancel_time", type: "timestamptz", nullable: true })
  cancelTime!: Date | null;

  @Column({ name: "satisfaction", type: "smallint", nullable: true })
  satisfaction!: number | null;

  @Column({ name: "evaluation", type: "text", nullable: true })
  evaluation!: string | null;

  @Column({ name: "resolve_note", type: "text", nullable: true })
  resolveNote!: string | null;
}
