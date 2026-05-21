import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("sys_user_identity")
@Index("idx_sys_user_identity_user", ["tenantId", "parkId", "userId", "isDeleted"])
export class UserIdentityEntity extends AuditableEntity {
  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "provider", type: "varchar", length: 32 })
  provider!: string;

  @Column({ name: "provider_user_id", type: "varchar", length: 191 })
  providerUserId!: string;

  @Column({ name: "provider_union_id", type: "varchar", length: 191, nullable: true })
  providerUnionId!: string | null;

  @Column({ name: "mobile", type: "varchar", length: 32, nullable: true })
  mobile!: string | null;

  @Column({ name: "email", type: "varchar", length: 128, nullable: true })
  email!: string | null;

  @Column({ name: "nickname", type: "varchar", length: 100, nullable: true })
  nickname!: string | null;

  @Column({ name: "avatar_url", type: "varchar", length: 500, nullable: true })
  avatarUrl!: string | null;

  @Column({ name: "raw_profile_json", type: "jsonb", nullable: true })
  rawProfileJson!: Record<string, unknown> | null;

  @Column({ name: "bind_status", type: "varchar", length: 32, default: "bound" })
  bindStatus!: string;

  @Column({ name: "last_login_time", type: "timestamptz", nullable: true })
  lastLoginTime!: Date | null;
}
