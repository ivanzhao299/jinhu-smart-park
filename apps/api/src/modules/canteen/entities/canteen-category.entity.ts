import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_categories")
@Index("idx_canteen_categories_scope_outlet_sort", ["tenantId", "parkId", "outletId", "sortOrder"])
export class CanteenCategoryEntity extends AuditableEntity {
  @Column({ name: "outlet_id", type: "uuid" })
  outletId!: string;

  @Column({ type: "varchar", length: 64 })
  name!: string;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ type: "varchar", length: 8, default: "on" })
  status!: string;
}
