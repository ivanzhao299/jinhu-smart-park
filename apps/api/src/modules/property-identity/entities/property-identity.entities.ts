import { Column, Entity, PrimaryColumn } from "typeorm";

abstract class ScopedIdentityEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;
}

@Entity("biz_party_identity_verification_queue")
export class PartyIdentityVerificationQueueEntity extends ScopedIdentityEntity {
  @Column({ name: "queue_code", type: "varchar", length: 64 })
  queueCode!: string;

  @Column({ name: "display_name", type: "varchar", length: 128 })
  displayName!: string;

  @Column({ type: "varchar", length: 16 })
  status!: "active" | "inactive";

  @Column({ name: "eligibility_policy_snapshot", type: "jsonb" })
  eligibilityPolicySnapshot!: Record<string, unknown>;

  @Column({ name: "eligibility_policy_hash", type: "varchar", length: 64 })
  eligibilityPolicyHash!: string;
}

@Entity("biz_party_identity_submission")
export class PartyIdentitySubmissionEntity extends ScopedIdentityEntity {
  @Column({ name: "party_id", type: "uuid" })
  partyId!: string;

  @Column({ name: "identity_version", type: "bigint" })
  identityVersion!: string;

  @Column({ name: "submission_attempt", type: "integer" })
  submissionAttempt!: number;

  @Column({ type: "varchar", length: 32 })
  status!: string;

  @Column({ type: "integer" })
  version!: number;
}

@Entity("biz_party_identity_snapshot")
export class PartyIdentitySnapshotEntity extends ScopedIdentityEntity {
  @Column({ name: "party_id", type: "uuid" })
  partyId!: string;

  @Column({ name: "identity_version", type: "bigint" })
  identityVersion!: string;
}

@Entity("biz_party_identity_decision")
export class PartyIdentityDecisionEntity extends ScopedIdentityEntity {
  @Column({ name: "submission_id", type: "uuid" })
  submissionId!: string;

  @Column({ type: "varchar", length: 16 })
  decision!: "verified" | "rejected";
}

@Entity("biz_party_identity_assignment_audit")
export class PartyIdentityAssignmentAuditEntity extends ScopedIdentityEntity {
  @Column({ name: "submission_id", type: "uuid" })
  submissionId!: string;

  @Column({ type: "varchar", length: 16 })
  action!: string;
}

@Entity("rel_party_identity_snapshot_file")
export class PartyIdentitySnapshotFileEntity extends ScopedIdentityEntity {
  @Column({ name: "snapshot_id", type: "uuid" })
  snapshotId!: string;

  @Column({ name: "file_id", type: "uuid" })
  fileId!: string;
}

@Entity("rel_party_identity_draft_file")
export class PartyIdentityDraftFileEntity extends ScopedIdentityEntity {
  @Column({ name: "submission_id", type: "uuid" })
  submissionId!: string;

  @Column({ name: "file_id", type: "uuid" })
  fileId!: string;
}
