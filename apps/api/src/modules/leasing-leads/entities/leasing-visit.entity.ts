import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { LeasingLeadEntity } from "./leasing-lead.entity";

@Entity("biz_leasing_visit")
@Index("idx_biz_leasing_visit_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_visit_lead_time_entity", ["tenantId", "parkId", "leadId", "visitTime"])
export class LeasingVisitEntity extends AuditableEntity {
  @Column({ name: "lead_id", type: "uuid" })
  leadId!: string;

  @ManyToOne(() => LeasingLeadEntity)
  @JoinColumn({ name: "lead_id" })
  lead!: LeasingLeadEntity;

  @Column({ name: "visit_time", type: "timestamptz", default: () => "now()" })
  visitTime!: Date;

  @Column({ name: "visitor_count", type: "integer", default: 1 })
  visitorCount!: number;

  @Column({ name: "reception_user_id", type: "uuid", nullable: true })
  receptionUserId!: string | null;

  @Column({ name: "reception_user_name", type: "varchar", length: 100, nullable: true })
  receptionUserName!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: "reception_user_id" })
  receptionUser?: UserEntity | null;

  @Column({ name: "unit_ids", type: "jsonb", default: [] })
  unitIds!: string[];

  @Column({ name: "visit_result", type: "text", nullable: true })
  visitResult!: string | null;

  @Column({ name: "photo_file_ids", type: "jsonb", default: [] })
  photoFileIds!: string[];
}
