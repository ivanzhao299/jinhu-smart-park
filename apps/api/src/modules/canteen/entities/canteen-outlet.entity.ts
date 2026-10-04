import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_outlets")
@Index("uq_canteen_outlets_scope_no", ["tenantId", "outletNo"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("idx_canteen_outlets_scope_contractor", ["tenantId", "parkId", "contractorId"])
@Index("idx_canteen_outlets_scope_status", ["tenantId", "parkId", "status"])
export class CanteenOutletEntity extends AuditableEntity {
  @Column({ name: "outlet_no", type: "varchar", length: 32 })
  outletNo!: string;

  @Column({ type: "varchar", length: 128 })
  name!: string;

  @Column({ name: "outlet_type", type: "varchar", length: 16 })
  outletType!: string;

  @Column({ name: "contractor_id", type: "varchar", length: 64 })
  contractorId!: string;

  @Column({ type: "varchar", length: 256, nullable: true })
  location!: string | null;

  @Column({ name: "business_hours", type: "varchar", length: 128, nullable: true })
  businessHours!: string | null;

  @Column({ type: "varchar", length: 16, default: "open" })
  status!: string;

  @Column({ name: "manager_user_id", type: "uuid", nullable: true })
  managerUserId!: string | null;
}
