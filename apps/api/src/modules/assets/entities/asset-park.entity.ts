import { Column, Entity, Index, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { AssetBuildingEntity } from "./asset-building.entity";

@Entity("asset_park")
@Index("idx_asset_park_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_asset_park_scope_code", ["tenantId", "parkId", "parkCode"], { unique: true, where: "is_deleted = false" })
export class AssetParkEntity extends AuditableEntity {
  @Column({ name: "park_code", type: "varchar", length: 64 })
  parkCode!: string;

  @Column({ name: "park_name", type: "varchar", length: 100 })
  parkName!: string;

  @Column({ name: "address", type: "varchar", length: 255, nullable: true })
  address!: string | null;

  @Column({ name: "total_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  totalArea!: string;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => AssetBuildingEntity, (building) => building.assetPark)
  buildings!: AssetBuildingEntity[];
}
