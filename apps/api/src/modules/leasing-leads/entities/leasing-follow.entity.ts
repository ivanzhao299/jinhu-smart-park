import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { LeasingLeadEntity } from "./leasing-lead.entity";

@Entity("biz_leasing_follow")
@Index("idx_biz_leasing_follow_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_follow_lead_time_entity", ["tenantId", "parkId", "leadId", "followTime"])
export class LeasingFollowEntity extends AuditableEntity {
  @Column({ name: "lead_id", type: "uuid" })
  leadId!: string;

  @ManyToOne(() => LeasingLeadEntity)
  @JoinColumn({ name: "lead_id" })
  lead!: LeasingLeadEntity;

  @Column({ name: "follow_time", type: "timestamptz", default: () => "now()" })
  followTime!: Date;

  @Column({ name: "follow_user_id", type: "uuid", nullable: true })
  followUserId!: string | null;

  @Column({ name: "follow_user_name", type: "varchar", length: 100, nullable: true })
  followUserName!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: "follow_user_id" })
  followUser?: UserEntity | null;

  @Column({ name: "follow_type", type: "varchar", length: 32, nullable: true })
  followType!: string | null;

  @Column({ name: "content", type: "text" })
  content!: string;

  @Column({ name: "next_action", type: "varchar", length: 500, nullable: true })
  nextAction!: string | null;

  @Column({ name: "next_follow_time", type: "timestamptz", nullable: true })
  nextFollowTime!: Date | null;

  @Column({ name: "attachment_file_ids", type: "jsonb", default: [] })
  attachmentFileIds!: string[];
}
