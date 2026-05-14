import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { OrgEntity } from "./org.entity";
import { PostEntity } from "./post.entity";

@Entity("rel_user_org")
@Index("idx_rel_user_org_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_rel_user_org_scope_user", ["tenantId", "parkId", "userId"])
export class UserOrgEntity extends AuditableEntity {
  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "org_id", type: "uuid" })
  orgId!: string;

  @Column({ name: "post_id", type: "uuid", nullable: true })
  postId!: string | null;

  @Column({ name: "is_primary", type: "boolean", default: false })
  isPrimary!: boolean;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => OrgEntity, (org) => org.userLinks)
  @JoinColumn({ name: "org_id" })
  org!: OrgEntity;

  @ManyToOne(() => PostEntity, (post) => post.userLinks)
  @JoinColumn({ name: "post_id" })
  post!: PostEntity | null;
}
