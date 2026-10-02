import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_order_items")
@Index("idx_canteen_order_items_scope_order", ["tenantId", "parkId", "orderId"])
@Index("idx_canteen_order_items_scope_dish", ["tenantId", "parkId", "dishId"])
export class CanteenOrderItemEntity extends AuditableEntity {
  @Column({ name: "order_id", type: "uuid" })
  orderId!: string;

  @Column({ name: "dish_id", type: "uuid" })
  dishId!: string;

  @Column({ name: "dish_name_snapshot", type: "varchar", length: 128 })
  dishNameSnapshot!: string;

  @Column({ name: "price_snapshot", type: "numeric", precision: 12, scale: 2 })
  priceSnapshot!: string;

  @Column({ type: "integer" })
  qty!: number;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @Column({ name: "category_snapshot", type: "varchar", length: 64, nullable: true })
  categorySnapshot!: string | null;
}
