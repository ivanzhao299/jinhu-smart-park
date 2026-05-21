import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { BuildingEntity } from "../../buildings/entities/building.entity";
import { FloorEntity } from "../../floors/entities/floor.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../../units/entities/unit.entity";

@Entity("biz_safety_inspect_point")
@Index("idx_biz_safety_inspect_point_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_inspect_point_type", ["tenantId", "parkId", "pointType", "isDeleted"])
@Index("idx_biz_safety_inspect_point_risk", ["tenantId", "parkId", "riskLevel", "isDeleted"])
@Index("idx_biz_safety_inspect_point_unit", ["tenantId", "parkId", "unitId", "isDeleted"])
@Index("idx_biz_safety_inspect_point_tenant", ["tenantId", "parkId", "parkTenantId", "isDeleted"])
@Index("uk_biz_safety_inspect_point_code", ["tenantId", "parkId", "pointCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class SafetyInspectPointEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "point_code", type: "varchar", length: 64 })
  pointCode!: string;

  @Column({ name: "point_name", type: "varchar", length: 200 })
  pointName!: string;

  @Column({ name: "point_type", type: "varchar", length: 64 })
  pointType!: string;

  @Column({ name: "risk_level", type: "varchar", length: 32 })
  riskLevel!: string;

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

  @Column({ name: "park_tenant_id", type: "uuid", nullable: true })
  parkTenantId!: string | null;

  @ManyToOne(() => ParkTenantEntity, { nullable: true })
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant?: ParkTenantEntity | null;

  @Column({ name: "location", type: "varchar", length: 300, nullable: true })
  location!: string | null;

  @Column({ name: "gps_lng", type: "numeric", precision: 12, scale: 6, nullable: true })
  gpsLng!: string | null;

  @Column({ name: "gps_lat", type: "numeric", precision: 12, scale: 6, nullable: true })
  gpsLat!: string | null;

  @Column({ name: "qr_code", type: "varchar", length: 200, nullable: true })
  qrCode!: string | null;

  @Column({ name: "check_method", type: "varchar", length: 64, nullable: true })
  checkMethod!: string | null;

  @Column({ name: "required_photo_count", type: "integer", default: 0 })
  requiredPhotoCount!: number;

  @Column({ name: "required_scan", type: "boolean", default: false })
  requiredScan!: boolean;

  @Column({ name: "required_gps", type: "boolean", default: false })
  requiredGps!: boolean;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @Column({ name: "sort_no", type: "integer", default: 0 })
  sortNo!: number;
}
