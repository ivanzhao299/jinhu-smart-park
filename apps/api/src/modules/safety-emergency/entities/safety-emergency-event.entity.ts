import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { BuildingEntity } from "../../buildings/entities/building.entity";
import { FloorEntity } from "../../floors/entities/floor.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../../units/entities/unit.entity";
import { SafetyEmergencyPlanEntity } from "./safety-emergency-plan.entity";

@Entity("biz_safety_emergency_event")
@Index("idx_biz_safety_emergency_event_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_emergency_event_status", ["tenantId", "parkId", "status", "isDeleted"])
@Index("idx_biz_safety_emergency_event_source", ["tenantId", "parkId", "sourceType", "sourceId", "isDeleted"])
@Index("idx_biz_safety_emergency_event_unit", ["tenantId", "parkId", "unitId", "isDeleted"])
@Index("idx_biz_safety_emergency_event_park_tenant", ["tenantId", "parkId", "parkTenantId", "isDeleted"])
@Index("idx_biz_safety_emergency_event_plan", ["tenantId", "parkId", "emergencyPlanId", "isDeleted"])
@Index("uk_biz_safety_emergency_event_code", ["tenantId", "parkId", "emergencyCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class SafetyEmergencyEventEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "emergency_code", type: "varchar", length: 64 })
  emergencyCode!: string;

  @Column({ name: "source_type", type: "varchar", length: 64, default: "manual" })
  sourceType!: string;

  @Column({ name: "source_id", type: "uuid", nullable: true })
  sourceId!: string | null;

  @Column({ name: "incident_type", type: "varchar", length: 64 })
  incidentType!: string;

  @Column({ name: "severity_level", type: "varchar", length: 32 })
  severityLevel!: string;

  @Column({ name: "response_level", type: "varchar", length: 32, nullable: true })
  responseLevel!: string | null;

  @Column({ name: "title", type: "varchar", length: 200 })
  title!: string;

  @Column({ name: "description", type: "text" })
  description!: string;

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

  @Column({ name: "park_tenant_id", type: "uuid", nullable: true })
  parkTenantId!: string | null;

  @ManyToOne(() => ParkTenantEntity, { eager: false, nullable: true })
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant!: ParkTenantEntity | null;

  @Column({ name: "location", type: "varchar", length: 500 })
  location!: string;

  @Column({ name: "gps_lng", type: "numeric", precision: 10, scale: 6, nullable: true })
  gpsLng!: string | null;

  @Column({ name: "gps_lat", type: "numeric", precision: 10, scale: 6, nullable: true })
  gpsLat!: string | null;

  @Column({ name: "reporter_id", type: "uuid", nullable: true })
  reporterId!: string | null;

  @Column({ name: "reporter_name", type: "varchar", length: 100, nullable: true })
  reporterName!: string | null;

  @Column({ name: "reporter_mobile", type: "varchar", length: 32, nullable: true })
  reporterMobile!: string | null;

  @Column({ name: "commander_id", type: "uuid", nullable: true })
  commanderId!: string | null;

  @Column({ name: "commander_name", type: "varchar", length: 100, nullable: true })
  commanderName!: string | null;

  @Column({ name: "response_team_user_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  responseTeamUserIds!: string[];

  @Column({ name: "emergency_plan_id", type: "uuid", nullable: true })
  emergencyPlanId!: string | null;

  @ManyToOne(() => SafetyEmergencyPlanEntity, { eager: false, nullable: true })
  @JoinColumn({ name: "emergency_plan_id" })
  emergencyPlan!: SafetyEmergencyPlanEntity | null;

  @Column({ name: "photos_file_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  photosFileIds!: string[];

  @Column({ name: "videos_file_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  videosFileIds!: string[];

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;

  @Column({ name: "report_time", type: "timestamptz" })
  reportTime!: Date;

  @Column({ name: "response_time", type: "timestamptz", nullable: true })
  responseTime!: Date | null;

  @Column({ name: "control_time", type: "timestamptz", nullable: true })
  controlTime!: Date | null;

  @Column({ name: "close_time", type: "timestamptz", nullable: true })
  closeTime!: Date | null;

  @Column({ name: "cancel_time", type: "timestamptz", nullable: true })
  cancelTime!: Date | null;

  @Column({ name: "review_file_id", type: "uuid", nullable: true })
  reviewFileId!: string | null;

  @Column({ name: "conclusion", type: "text", nullable: true })
  conclusion!: string | null;
}
