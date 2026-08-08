import {
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import {
  IDENTITY_MUTATION_ACTION_IDS,
  PROPERTY_BUSINESS_PERMISSIONS,
  resolveIdentityClientKey,
  type IdentityAuditListResponse,
  type IdentitySubmissionListResponse,
  type IdentitySubmissionProjection,
  type PartyIdentitySummary,
  type TenantParkScope,
  type VerifiedIdentityEvidence
} from "@jinhu/shared";
import { createHash, randomUUID } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  normalizePartyIdentityNumber,
  isValidPartyIdentityNumber
} from "../property-operations/party-identity.policy";
import { PartySensitiveDataService } from "../property-operations/party-sensitive-data.service";
import type {
  ClaimIdentityDto,
  CreateIdentityDraftDto,
  DecideIdentityDto,
  IdentityAuditListQueryDto,
  IdentitySubmissionListQueryDto,
  ReassignIdentityDto,
  SubmitIdentityDto,
  UpdateIdentityDraftDto,
  WithdrawIdentityDto
} from "./dto/identity-submission.dto";
import {
  propertyIdentityError,
  translateIdentityDatabaseError
} from "./property-identity.error";

export const PROPERTY_IDENTITY_RECEIPT_ACTION_IDS = IDENTITY_MUTATION_ACTION_IDS;

type IdentityActionId = (typeof PROPERTY_IDENTITY_RECEIPT_ACTION_IDS)[number];

interface SubmissionRow {
  id: string;
  party_id: string;
  party_display_name: string;
  status: IdentitySubmissionProjection["status"];
  version: number;
  identity_version: string | number;
  submission_attempt: number;
  supersedes_submission_id: string | null;
  verification_queue_id: string | null;
  verification_queue_name: string | null;
  assigned_verifier_id: string | null;
  assigned_verifier_display_name: string | null;
  assignment_version: number;
  eligibility_policy_hash: string | null;
  eligibility_policy_snapshot: Record<string, unknown> | null;
  drafted_by: string | null;
  recorded_by: string | null;
  submitted_by: string | null;
  snapshot_id: string | null;
  document_type: "id_card" | "passport" | null;
  encrypted_payload: string | null;
  identity_number_masked: string | null;
  drafted_at: Date | string;
  submitted_at: Date | string | null;
  decided_at: Date | string | null;
  withdrawn_at: Date | string | null;
  superseded_at: Date | string | null;
  update_time: Date | string;
  files: Array<{
    fileId: string;
    fileName: string;
    mimeType: string;
    fileSize: string | number;
    fileVersion: number;
  }> | null;
}

interface ReceiptRow {
  request_hash: string;
  receipt_status: "started" | "completed" | "failed";
  result_ref: string | null;
}

const PROJECTION_SQL = `
  SELECT s.id, s.party_id, p.display_name AS party_display_name, s.status, s.version,
    s.identity_version, s.submission_attempt, s.supersedes_submission_id,
    s.verification_queue_id, q.display_name AS verification_queue_name,
    s.assigned_verifier_id, verifier.display_name AS assigned_verifier_display_name,
    s.assignment_version, s.eligibility_policy_hash, s.eligibility_policy_snapshot,
    s.drafted_by, s.recorded_by, s.submitted_by, s.snapshot_id,
    COALESCE(snapshot.document_type, p.identity_document_type) AS document_type,
    snapshot.encrypted_payload,
    CASE WHEN snapshot.id IS NULL THEN p.identity_number_masked ELSE NULL END AS identity_number_masked,
    s.drafted_at, s.submitted_at, s.decided_at, s.withdrawn_at, s.superseded_at,
    s.update_time,
    COALESCE(evidence.files, '[]'::jsonb) AS files
  FROM public.biz_party_identity_submission s
  JOIN public.biz_party p
    ON p.tenant_id=s.tenant_id AND p.park_id=s.park_id AND p.id=s.party_id
  LEFT JOIN public.biz_party_identity_verification_queue q
    ON q.tenant_id=s.tenant_id AND q.park_id=s.park_id AND q.id=s.verification_queue_id
  LEFT JOIN public.sys_user verifier
    ON verifier.tenant_id=s.tenant_id AND verifier.park_id=s.park_id
   AND verifier.id=s.assigned_verifier_id AND verifier.is_deleted=false
  LEFT JOIN public.biz_party_identity_snapshot snapshot
    ON snapshot.tenant_id=s.tenant_id AND snapshot.park_id=s.park_id AND snapshot.id=s.snapshot_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'fileId', f.id,
      'fileName', f.original_name,
      'mimeType', f.mime_type,
      'fileSize', f.file_size,
      'fileVersion', refs.file_version
    ) ORDER BY refs.ordinal, f.id) AS files
    FROM (
      SELECT draft.file_id, draft.file_version, draft.ordinal
      FROM public.rel_party_identity_draft_file draft
      WHERE draft.tenant_id=s.tenant_id AND draft.park_id=s.park_id
        AND draft.submission_id=s.id
      UNION ALL
      SELECT frozen.file_id, frozen.file_version, frozen.ordinal
      FROM public.rel_party_identity_snapshot_file frozen
      WHERE frozen.tenant_id=s.tenant_id AND frozen.park_id=s.park_id
        AND frozen.snapshot_id=s.snapshot_id
        AND NOT EXISTS (
          SELECT 1 FROM public.rel_party_identity_draft_file draft
          WHERE draft.tenant_id=s.tenant_id AND draft.park_id=s.park_id
            AND draft.submission_id=s.id
        )
    ) refs
    JOIN public.sys_file f
      ON f.tenant_id=s.tenant_id AND f.park_id=s.park_id AND f.id=refs.file_id
  ) evidence ON true
`;

@Injectable()
export class PropertyIdentityService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly sensitiveData: PartySensitiveDataService
  ) {}

  async list(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: IdentitySubmissionListQueryDto
  ): Promise<IdentitySubmissionListResponse> {
    this.assertDateRange(query.submittedFrom, query.submittedTo);
    const params: unknown[] = [scope.tenantId, scope.parkId, actor.sub];
    const where = [
      "s.tenant_id=$1",
      "s.park_id=$2",
      this.visibilityPredicate(actor)
    ];
    this.pushFilter(where, params, "s.status", query.status);
    this.pushFilter(where, params, "s.party_id", query.partyId, "::uuid");
    this.pushFilter(where, params, "s.verification_queue_id", query.verificationQueueId, "::uuid");
    if (query.assignment === "mine") where.push("s.assigned_verifier_id=$3::uuid");
    if (query.assignment === "unassigned") {
      where.push("s.status='pending_verification' AND s.assigned_verifier_id IS NULL");
    }
    if (query.submittedFrom) {
      params.push(query.submittedFrom);
      where.push(`s.submitted_at >= $${params.length}::timestamptz`);
    }
    if (query.submittedTo) {
      params.push(query.submittedTo);
      where.push(`s.submitted_at < $${params.length}::timestamptz`);
    }
    const sortMap = {
      createTime: "s.create_time",
      submittedAt: "s.submitted_at",
      decidedAt: "s.decided_at",
      updateTime: "s.update_time"
    } as const;
    const sort = query.sort ? sortMap[query.sort] : "s.submitted_at";
    const order = query.order === "asc" ? "ASC" : "DESC";
    params.push((query.page - 1) * query.pageSize, query.pageSize);
    const offsetIndex = params.length - 1;
    const rows = await this.dataSource.query(
      `${PROJECTION_SQL}
       WHERE ${where.join(" AND ")}
       ORDER BY ${sort} ${order} NULLS LAST, s.id ${order}
       OFFSET $${offsetIndex} LIMIT $${offsetIndex + 1}`,
      params
    ) as SubmissionRow[];
    const countRows = await this.dataSource.query(
      `SELECT count(*)::int AS total
       FROM public.biz_party_identity_submission s
       JOIN public.biz_party p
         ON p.tenant_id=s.tenant_id AND p.park_id=s.park_id AND p.id=s.party_id
       WHERE ${where.join(" AND ")}`,
      params.slice(0, -2)
    ) as Array<{ total: number }>;
    return {
      items: rows.map((row) => this.project(row, actor)),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(countRows[0]?.total ?? 0),
      allowedActions: []
    };
  }

  async detail(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    submissionId: string,
    manager: EntityManager = this.dataSource.manager
  ): Promise<IdentitySubmissionProjection> {
    const rows = await manager.query(
      `${PROJECTION_SQL}
       WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.id=$4::uuid
         AND ${this.visibilityPredicate(actor)}`,
      [scope.tenantId, scope.parkId, actor.sub, submissionId]
    ) as SubmissionRow[];
    const row = rows[0];
    if (!row) throw propertyIdentityError("property-resource-not-found");
    return this.project(row, actor);
  }

  create(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    headerKey: string | undefined,
    dto: CreateIdentityDraftDto,
    transactionManager?: EntityManager
  ) {
    this.assertSupersedeTuple(dto);
    return this.mutate(
      scope, actor, headerKey, dto, "party.identity.create-draft", dto.partyId,
      async (manager) => {
        const rows = await manager.query(
          `SELECT * FROM public.fn_party_identity_create_draft_cas(
             $1,$2,$3::uuid,$4::uuid,$5::bigint,$6::uuid,$7,$8::int
           )`,
          [
            scope.tenantId, scope.parkId, dto.partyId, actor.sub,
            dto.expectedIdentityVersion, dto.supersedesSubmissionId ?? null,
            dto.expectedSupersededStatus ?? null, dto.expectedSupersededVersion ?? null
          ]
        ) as Array<{ id: string }>;
        const resultId = rows[0]?.id;
        if (dto.supersedesSubmissionId) {
          const superseded = await this.projectionById(
            manager,
            scope,
            actor,
            dto.supersedesSubmissionId
          );
          await this.appendOutbox(
            manager,
            scope,
            actor,
            "party.identity.create-draft",
            superseded,
            dto as unknown as Record<string, unknown>,
            "party.identity.superseded"
          );
        }
        return resultId;
      },
      transactionManager
    );
  }

  update(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    submissionId: string,
    headerKey: string | undefined,
    dto: UpdateIdentityDraftDto,
    transactionManager?: EntityManager
  ) {
    if ((dto.documentType === null) !== (dto.identityNumber === null)) {
      throw propertyIdentityError("property-validation-failed");
    }
    const normalized = normalizePartyIdentityNumber(dto.documentType, dto.identityNumber);
    if (normalized && !isValidPartyIdentityNumber(dto.documentType, normalized)) {
      throw propertyIdentityError("property-validation-failed");
    }
    if (!normalized && dto.pendingFileIds.length) {
      throw propertyIdentityError("property-validation-failed");
    }
    return this.mutate(
      scope, actor, headerKey, dto, "party.identity.update-draft", submissionId,
      async (manager) => {
        await this.assertDraftOwner(manager, scope, submissionId, actor.sub);
        const crypto = normalized ? this.sensitiveData.identityProfile(normalized) : null;
        const rows = await manager.query(
          `SELECT * FROM public.fn_party_identity_update_draft_cas(
             $1,$2,$3::uuid,$4::uuid,$5::int,$6,$7,$8,$9,$10,$11,$12,$13,$14::uuid[]
           )`,
          [
            scope.tenantId, scope.parkId, submissionId, actor.sub, dto.expectedVersion,
            dto.documentType, crypto?.encrypted ?? null, crypto?.hash ?? null,
            crypto?.masked ?? null, crypto?.hashAlgorithm ?? null,
            crypto?.hashVersion ?? null, crypto?.encryptionKeyId ?? null,
            crypto?.payloadFormatVersion ?? null, dto.pendingFileIds
          ]
        ) as Array<{ id: string }>;
        return rows[0]?.id;
      },
      transactionManager
    );
  }

  submit(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    submissionId: string,
    headerKey: string | undefined,
    dto: SubmitIdentityDto,
    transactionManager?: EntityManager
  ) {
    return this.mutate(
      scope, actor, headerKey, dto, "party.identity.submit", submissionId,
      async (manager) => {
        await this.assertDraftOwner(manager, scope, submissionId, actor.sub);
        const queues = await manager.query(
          `SELECT id, eligibility_policy_snapshot, eligibility_policy_hash
           FROM public.biz_party_identity_verification_queue
           WHERE tenant_id=$1 AND park_id=$2 AND status='active'
             AND legacy_backfill=false
           ORDER BY queue_code ASC, id ASC
           LIMIT 1`,
          [scope.tenantId, scope.parkId]
        ) as Array<{
          id: string;
          eligibility_policy_snapshot: Record<string, unknown>;
          eligibility_policy_hash: string;
        }>;
        const queue = queues[0];
        if (!queue) throw propertyIdentityError("property-runtime-unavailable");
        const rows = await manager.query(
          `SELECT * FROM public.fn_party_identity_submit_cas(
             $1,$2,$3::uuid,$4::uuid,$5::int,$6::uuid,$7::jsonb,$8
           )`,
          [
            scope.tenantId, scope.parkId, submissionId, actor.sub, dto.expectedVersion,
            queue.id, JSON.stringify(queue.eligibility_policy_snapshot),
            queue.eligibility_policy_hash
          ]
        ) as Array<{ id: string }>;
        return rows[0]?.id;
      },
      transactionManager
    );
  }

  claim(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    submissionId: string,
    headerKey: string | undefined,
    dto: ClaimIdentityDto,
    transactionManager?: EntityManager
  ) {
    return this.mutate(
      scope, actor, headerKey, dto, "party.identity.claim", submissionId,
      async (manager) => {
        await this.assertAssignmentEligibility(manager, scope, submissionId, actor.sub, false);
        const rows = await manager.query(
          `SELECT * FROM public.fn_party_identity_assignment_cas(
             $1,$2,$3::uuid,$4::uuid,'claim',$4::uuid,NULL,$5,$6::int,$7::int
           )`,
          [
            scope.tenantId, scope.parkId, submissionId, actor.sub, dto.clientKey,
            dto.expectedVersion, dto.expectedAssignmentVersion
          ]
        ) as Array<{ id: string }>;
        return rows[0]?.id;
      },
      transactionManager
    );
  }

  reassign(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    submissionId: string,
    headerKey: string | undefined,
    dto: ReassignIdentityDto,
    transactionManager?: EntityManager
  ) {
    return this.mutate(
      scope, actor, headerKey, dto, "party.identity.reassign", submissionId,
      async (manager) => {
        await this.assertAssignmentEligibility(manager, scope, submissionId, actor.sub, true);
        if (dto.assignedVerifierId) {
          await this.assertVerifierPermission(
            manager,
            scope,
            submissionId,
            dto.assignedVerifierId
          );
        }
        const action = dto.assignedVerifierId ? "reassign" : "revoke";
        const rows = await manager.query(
          `SELECT * FROM public.fn_party_identity_assignment_cas(
             $1,$2,$3::uuid,$4::uuid,$5,$6::uuid,$7,$8,$9::int,$10::int
           )`,
          [
            scope.tenantId, scope.parkId, submissionId, actor.sub, action,
            dto.assignedVerifierId, dto.reason, dto.clientKey,
            dto.expectedVersion, dto.expectedAssignmentVersion
          ]
        ) as Array<{ id: string }>;
        return rows[0]?.id;
      },
      transactionManager
    );
  }

  decide(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    submissionId: string,
    headerKey: string | undefined,
    dto: DecideIdentityDto,
    transactionManager?: EntityManager
  ) {
    return this.mutate(
      scope, actor, headerKey, dto, "party.identity.verify", submissionId,
      async (manager) => {
        await this.assertAssignmentEligibility(manager, scope, submissionId, actor.sub, false, true);
        const rows = await manager.query(
          `SELECT * FROM public.fn_party_identity_decision_cas(
             $1,$2,$3::uuid,$4::uuid,$5,$6,$7::int,$8::int
           )`,
          [
            scope.tenantId, scope.parkId, submissionId, actor.sub, dto.decision,
            dto.reason ?? null, dto.expectedVersion, dto.expectedAssignmentVersion
          ]
        ) as Array<{ id: string }>;
        return rows[0]?.id;
      },
      transactionManager
    );
  }

  withdraw(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    submissionId: string,
    headerKey: string | undefined,
    dto: WithdrawIdentityDto,
    transactionManager?: EntityManager
  ) {
    return this.mutate(
      scope, actor, headerKey, dto, "party.identity.withdraw", submissionId,
      async (manager) => {
        const rows = await manager.query(
          `SELECT * FROM public.fn_party_identity_withdraw_cas(
             $1,$2,$3::uuid,$4::uuid,$5,$6,$7::int
           )`,
          [
            scope.tenantId, scope.parkId, submissionId, actor.sub, dto.reason,
            dto.clientKey, dto.expectedVersion
          ]
        ) as Array<{ id: string }>;
        return rows[0]?.id;
      },
      transactionManager
    );
  }

  async audit(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    submissionId: string,
    query: IdentityAuditListQueryDto
  ): Promise<IdentityAuditListResponse> {
    await this.detail(scope, actor, submissionId);
    const offset = (query.page - 1) * query.pageSize;
    const order = query.order === "asc" ? "ASC" : "DESC";
    const rows = await this.dataSource.query(
      `SELECT event_id AS id,
         replace(event_type, 'party.identity.', '') AS event_type,
         aggregate_version AS submission_version,
         COALESCE((payload->>'assignmentVersion')::int,0) AS assignment_version,
         payload->>'actorId' AS actor_id,
         COALESCE(actor.display_name, '历史操作者未知') AS actor_name,
         payload->>'reason' AS reason,
         created_at AS occurred_at,
         payload->>'documentType' AS document_type,
         payload->>'identityNumberMasked' AS identity_number_masked,
         COALESCE((payload->>'fileCount')::int,0) AS file_count,
         count(*) OVER()::int AS total
       FROM public.biz_property_outbox outbox
       LEFT JOIN public.sys_user actor
         ON actor.tenant_id=outbox.tenant_id AND actor.park_id=outbox.park_id
        AND actor.id=(outbox.payload->>'actorId')::uuid
       WHERE outbox.tenant_id=$1 AND outbox.park_id=$2
         AND outbox.aggregate_type='party_identity_submission'
         AND outbox.aggregate_id=$3::uuid
         AND outbox.event_type LIKE 'party.identity.%'
       ORDER BY occurred_at ${order}, id ${order}
       OFFSET $4 LIMIT $5`,
      [scope.tenantId, scope.parkId, submissionId, offset, query.pageSize]
    ) as Array<Record<string, unknown>>;
    const canReadSensitive = this.hasPermission(actor, PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ);
    return {
      items: rows.map((row) => ({
        id: String(row.id),
        eventType: String(row.event_type) as never,
        submissionVersion: Number(row.submission_version),
        assignmentVersion: Number(row.assignment_version),
        actor: {
          id: row.actor_id ? String(row.actor_id) : null,
          displayName: String(row.actor_name)
        },
        reason: row.reason ? String(row.reason) : null,
        occurredAt: this.time(row.occurred_at),
        evidence: row.document_type ? {
          documentType: String(row.document_type) as "id_card" | "passport",
          identityNumberMasked: canReadSensitive && row.identity_number_masked
            ? String(row.identity_number_masked) : null,
          fileCount: Number(row.file_count)
        } : null
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(rows[0]?.total ?? 0),
      allowedActions: []
    };
  }

  async partyIdentitySummary(
    manager: EntityManager,
    scope: TenantParkScope,
    partyIds: readonly string[],
    actor: JwtPrincipal
  ): Promise<Map<string, PartyIdentitySummary | null>> {
    const result = new Map<string, PartyIdentitySummary | null>(
      partyIds.map((id) => [id, null])
    );
    if (!partyIds.length) return result;
    const rows = await manager.query(
      `SELECT p.id AS party_id, p.identity_version, p.current_identity_submission_id,
         p.current_verified_submission_id, p.identity_document_type,
         p.identity_number_masked, s.status, s.update_time
       FROM public.biz_party p
       LEFT JOIN public.biz_party_identity_submission s
         ON s.tenant_id=p.tenant_id AND s.park_id=p.park_id
        AND s.id=p.current_identity_submission_id
       WHERE p.tenant_id=$1 AND p.park_id=$2 AND p.id=ANY($3::uuid[])
         AND p.is_deleted=false`,
      [scope.tenantId, scope.parkId, partyIds]
    ) as Array<Record<string, unknown>>;
    const canReadSensitive = this.hasPermission(actor, PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ);
    const canOpenIdentityWorkbench = this.hasPermission(
      actor,
      PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE
    ) && this.hasPermission(actor, PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ);
    for (const row of rows) {
      const currentId = row.current_identity_submission_id
        ? String(row.current_identity_submission_id) : null;
      if (!currentId && Number(row.identity_version) === 0) continue;
      const rawStatus = row.status ? String(row.status) : "unverified";
      const status = rawStatus === "superseded" ? "unverified" : rawStatus;
      result.set(String(row.party_id), {
        status: status as PartyIdentitySummary["status"],
        identityVersion: Number(row.identity_version),
        currentSubmissionId: currentId,
        currentVerifiedSubmissionId: row.current_verified_submission_id
          ? String(row.current_verified_submission_id) : null,
        documentType: row.identity_document_type
          ? String(row.identity_document_type) as "id_card" | "passport" : null,
        identityNumberMasked: canReadSensitive && row.identity_number_masked
          ? String(row.identity_number_masked) : null,
        submissionDeepLink: currentId && canOpenIdentityWorkbench
          ? `/assets/identity-submissions/${currentId}`
          : null,
        updatedAt: row.update_time ? this.time(row.update_time) : null
      });
    }
    return result;
  }

  async verifyForCheckIn(input: {
    manager: EntityManager;
    scope: TenantParkScope;
    bookingId: string;
    partyIds: readonly string[];
    expectedConsent: "granted";
  }): Promise<readonly VerifiedIdentityEvidence[]> {
    const partyIds = [...new Set(input.partyIds)].sort();
    if (!partyIds.length) return [];
    const rows = await input.manager.query(
      `SELECT p.id AS party_id, s.id AS submission_id,
         s.version AS submission_version, snapshot.id AS snapshot_id,
         snapshot.identity_version, snapshot.document_type,
         snapshot.hash_algorithm, snapshot.hash_version,
         s.decided_at AS verified_at
       FROM public.biz_party p
       JOIN public.biz_party_identity_submission s
         ON s.tenant_id=p.tenant_id AND s.park_id=p.park_id
        AND s.id=p.current_verified_submission_id
       JOIN public.biz_party_identity_snapshot snapshot
         ON snapshot.tenant_id=s.tenant_id AND snapshot.park_id=s.park_id
        AND snapshot.id=s.snapshot_id
       WHERE p.tenant_id=$1 AND p.park_id=$2 AND p.id=ANY($3::uuid[])
         AND p.consent_status=$4 AND p.is_deleted=false AND s.status='verified'
         AND p.identity_version=s.identity_version
       ORDER BY p.id
       FOR UPDATE OF p,s,snapshot`,
      [input.scope.tenantId, input.scope.parkId, partyIds, input.expectedConsent]
    ) as Array<Record<string, unknown>>;
    if (rows.length !== partyIds.length) {
      throw propertyIdentityError("identity-snapshot-stale");
    }
    const snapshotIds = rows.map((row) => String(row.snapshot_id)).sort();
    const references = await input.manager.query(
      `SELECT id,snapshot_id,file_id,file_version,content_sha256,ordinal
       FROM public.rel_party_identity_snapshot_file
       WHERE tenant_id=$1 AND park_id=$2 AND snapshot_id=ANY($3::uuid[])
       ORDER BY snapshot_id,id
       FOR UPDATE`,
      [input.scope.tenantId, input.scope.parkId, snapshotIds]
    ) as Array<{
      id: string;
      snapshot_id: string;
      file_id: string;
      file_version: number;
      content_sha256: string;
      ordinal: number;
    }>;
    const fileIds = [...new Set(references.map((reference) => reference.file_id))].sort();
    const files = fileIds.length
      ? await input.manager.query(
        `SELECT id,version,content_sha256,status,is_deleted
         FROM public.sys_file
         WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[])
         ORDER BY id
         FOR UPDATE`,
        [input.scope.tenantId, input.scope.parkId, fileIds]
      ) as Array<{
        id: string;
        version: number;
        content_sha256: string;
        status: number;
        is_deleted: boolean;
      }>
      : [];
    const currentFiles = new Map(files.map((file) => [file.id, file]));
    if (references.some((reference) => {
      const file = currentFiles.get(reference.file_id);
      return !file
        || file.is_deleted
        || file.status !== 1
        || file.version !== Number(reference.file_version)
        || file.content_sha256 !== reference.content_sha256;
    })) {
      throw propertyIdentityError("identity-snapshot-stale");
    }
    const referencesBySnapshot = new Map<string, typeof references>();
    for (const reference of references) {
      const group = referencesBySnapshot.get(reference.snapshot_id) ?? [];
      group.push(reference);
      referencesBySnapshot.set(reference.snapshot_id, group);
    }
    return rows.map((row) => ({
      partyId: String(row.party_id),
      submissionId: String(row.submission_id),
      submissionVersion: Number(row.submission_version),
      snapshotId: String(row.snapshot_id),
      identityVersion: Number(row.identity_version),
      documentType: String(row.document_type),
      hashAlgorithm: String(row.hash_algorithm),
      hashVersion: Number(row.hash_version),
      files: (referencesBySnapshot.get(String(row.snapshot_id)) ?? [])
        .sort((left, right) => left.ordinal - right.ordinal || left.file_id.localeCompare(right.file_id))
        .map((reference) => ({
          fileId: reference.file_id,
          fileVersion: Number(reference.file_version),
          contentSha256: reference.content_sha256
        })),
      verifiedAt: this.time(row.verified_at)
    }));
  }

  private async mutate<T extends { clientKey: string }>(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    headerKey: string | undefined,
    body: T,
    actionId: IdentityActionId,
    targetId: string,
    command: (manager: EntityManager) => Promise<string | undefined>,
    transactionManager?: EntityManager
  ): Promise<IdentitySubmissionProjection> {
    const clientKey = resolveIdentityClientKey(headerKey, body.clientKey);
    if (!clientKey) throw propertyIdentityError("property-validation-failed");
    const requestHash = this.requestHash(scope, actor, actionId, targetId, body);
    try {
      const execute = async (manager: EntityManager) => {
        const inserted = await manager.query(
          `INSERT INTO public.biz_property_mutation_receipt(
             tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash,
             receipt_contract_version
           ) VALUES($1,$2,$3::uuid,$4,$5::uuid,$6,$7,'legacy-v1')
           ON CONFLICT (tenant_id,park_id,actor_id,action_id,target_id,client_key)
           DO NOTHING RETURNING id`,
          [scope.tenantId, scope.parkId, actor.sub, actionId, targetId, clientKey, requestHash]
        ) as Array<{ id: string }>;
        const receiptRows = await manager.query(
          `SELECT request_hash,receipt_status,result_ref
           FROM public.biz_property_mutation_receipt
           WHERE tenant_id=$1 AND park_id=$2 AND actor_id=$3::uuid
             AND action_id=$4 AND target_id=$5::uuid AND client_key=$6
           FOR UPDATE`,
          [scope.tenantId, scope.parkId, actor.sub, actionId, targetId, clientKey]
        ) as ReceiptRow[];
        const receipt = receiptRows[0];
        if (!receipt) throw propertyIdentityError("property-runtime-unavailable");
        if (receipt.request_hash !== requestHash) {
          throw propertyIdentityError("idempotency-key-conflict");
        }
        if (!inserted.length && receipt.receipt_status === "completed" && receipt.result_ref) {
          return this.replayProjection(manager, scope, receipt.result_ref);
        }
        if (!inserted.length) throw propertyIdentityError("property-runtime-unavailable");
        const resultId = await command(manager);
        if (!resultId) throw propertyIdentityError("property-runtime-unavailable");
        const projection = await this.detail(scope, actor, resultId, manager);
        const resultRef = await this.appendOutbox(
          manager,
          scope,
          actor,
          actionId,
          projection,
          body
        );
        const resultHash = createHash("sha256")
          .update(this.stableStringify(projection))
          .digest("hex");
        await manager.query(
          `UPDATE public.biz_property_mutation_receipt
           SET receipt_status='completed',result_ref=$1,result_hash=$2,
               completed_at=clock_timestamp()
           WHERE tenant_id=$3 AND park_id=$4 AND actor_id=$5::uuid
             AND action_id=$6 AND target_id=$7::uuid AND client_key=$8
             AND receipt_status='started'`,
          [resultRef, resultHash, scope.tenantId, scope.parkId, actor.sub, actionId, targetId, clientKey]
        );
        return projection;
      };
      return transactionManager
        ? await execute(transactionManager)
        : await this.dataSource.transaction(execute);
    } catch (error) {
      translateIdentityDatabaseError(error);
    }
  }

  private async appendOutbox(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    actionId: IdentityActionId,
    projection: IdentitySubmissionProjection,
    body: Record<string, unknown>,
    eventTypeOverride?: string
  ): Promise<string> {
    const eventType = eventTypeOverride ?? this.eventType(actionId, body);
    const orderingKey = `party-identity:${projection.partyId}`;
    const sequenceRows = await manager.query(
      `INSERT INTO public.biz_property_event_sequence(
         tenant_id,park_id,ordering_key,next_sequence,version
       ) VALUES($1,$2,$3,2,1)
       ON CONFLICT (tenant_id,park_id,ordering_key)
       DO UPDATE SET next_sequence=public.biz_property_event_sequence.next_sequence+1,
                     version=public.biz_property_event_sequence.version+1
       RETURNING next_sequence-1 AS sequence`,
      [scope.tenantId, scope.parkId, orderingKey]
    ) as Array<{ sequence: string | number }>;
    const payload = {
      submissionId: projection.id,
      partyId: projection.partyId,
      actorId: actor.sub,
      status: projection.status,
      submissionVersion: projection.version,
      assignmentVersion: projection.assignmentVersion,
      reason: typeof body.reason === "string" ? body.reason : null,
      documentType: projection.evidence.documentType,
      identityNumberMasked: projection.evidence.identityNumberMasked,
      fileCount: projection.evidence.fileCount,
      response: projection
    };
    const payloadText = this.stableStringify(payload);
    const eventId = randomUUID();
    await manager.query(
      `INSERT INTO public.biz_property_outbox(
         event_id,tenant_id,park_id,event_type,event_version,aggregate_type,
         aggregate_id,aggregate_version,ordering_key,sequence,event_ordinal,
         payload,payload_hash
       ) VALUES($1::uuid,$2,$3,$4,1,'party_identity_submission',$5::uuid,$6,$7,$8,0,$9::jsonb,$10)`,
      [
        eventId, scope.tenantId, scope.parkId, eventType, projection.id,
        projection.version, orderingKey, Number(sequenceRows[0]?.sequence ?? 1),
        payloadText, createHash("sha256").update(payloadText).digest("hex")
      ]
    );
    return eventId;
  }

  private async replayProjection(
    manager: EntityManager,
    scope: TenantParkScope,
    eventId: string
  ): Promise<IdentitySubmissionProjection> {
    const rows = await manager.query(
      `SELECT payload->'response' AS response
       FROM public.biz_property_outbox
       WHERE tenant_id=$1 AND park_id=$2 AND event_id=$3::uuid
         AND aggregate_type='party_identity_submission'
         AND event_type LIKE 'party.identity.%'
       LIMIT 1`,
      [scope.tenantId, scope.parkId, eventId]
    ) as Array<{ response: IdentitySubmissionProjection | null }>;
    if (!rows[0]?.response) {
      throw propertyIdentityError("property-runtime-unavailable");
    }
    return rows[0].response;
  }

  private async projectionById(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    submissionId: string
  ): Promise<IdentitySubmissionProjection> {
    const rows = await manager.query(
      `${PROJECTION_SQL}
       WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.id=$3::uuid`,
      [scope.tenantId, scope.parkId, submissionId]
    ) as SubmissionRow[];
    if (!rows[0]) throw propertyIdentityError("property-runtime-unavailable");
    return this.project(rows[0], actor);
  }

  private project(row: SubmissionRow, actor: JwtPrincipal): IdentitySubmissionProjection {
    const canReadSensitive = this.hasPermission(actor, PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ);
    const decrypted = row.encrypted_payload
      ? this.sensitiveData.decrypt(row.encrypted_payload)
      : null;
    const masked = row.identity_number_masked
      ?? (decrypted ? this.sensitiveData.mask(decrypted) : null);
    const files = row.files ?? [];
    const allowedActions: Array<
      | "party.identity.submit"
      | "party.identity.claim"
      | "party.identity.reassign"
      | "party.identity.verify"
      | "party.identity.withdraw"
    > = [];
    const canVerify = this.hasPermission(actor, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY);
    const maker = [row.drafted_by, row.recorded_by, row.submitted_by].includes(actor.sub);
    if (row.status === "draft" && row.drafted_by === actor.sub) {
      allowedActions.push("party.identity.submit");
    }
    if (row.status === "pending_verification" && canVerify && !maker) {
      if (!row.assigned_verifier_id) allowedActions.push("party.identity.claim");
      if (row.assigned_verifier_id && this.isQueueSupervisor(row.eligibility_policy_snapshot, actor.sub)) {
        allowedActions.push("party.identity.reassign");
      }
      if (row.assigned_verifier_id === actor.sub) allowedActions.push("party.identity.verify");
    }
    if (row.status === "pending_verification" && maker) {
      allowedActions.push("party.identity.withdraw");
    }
    return {
      id: row.id,
      partyId: row.party_id,
      partyDisplayName: row.party_display_name,
      status: row.status,
      version: Number(row.version),
      identityVersion: Number(row.identity_version),
      submissionAttempt: Number(row.submission_attempt),
      supersedesSubmissionId: row.supersedes_submission_id,
      verificationQueueId: row.verification_queue_id,
      verificationQueueName: row.verification_queue_name,
      assignedVerifierId: row.assigned_verifier_id,
      assignedVerifierDisplayName: row.assigned_verifier_display_name,
      assignmentVersion: Number(row.assignment_version),
      eligibilityPolicyHash: row.eligibility_policy_hash,
      evidence: {
        documentType: row.document_type,
        identityNumberMasked: canReadSensitive ? masked : null,
        fileCount: files.length,
        files: files.map((file) => ({
          fileId: file.fileId,
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSize: Number(file.fileSize),
          fileVersion: Number(file.fileVersion)
        }))
      },
      draftedAt: this.time(row.drafted_at),
      submittedAt: row.submitted_at ? this.time(row.submitted_at) : null,
      decidedAt: row.decided_at ? this.time(row.decided_at) : null,
      withdrawnAt: row.withdrawn_at ? this.time(row.withdrawn_at) : null,
      supersededAt: row.superseded_at ? this.time(row.superseded_at) : null,
      updateTime: this.time(row.update_time),
      allowedActions
    };
  }

  private visibilityPredicate(actor: JwtPrincipal): string {
    if (
      this.hasPermission(actor, PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ)
      && this.hasPermission(actor, "audit:read")
    ) return "$3::uuid IS NOT NULL";
    if (this.hasPermission(actor, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY)) {
      return `(s.assigned_verifier_id=$3::uuid OR (
        s.status='pending_verification' AND s.assigned_verifier_id IS NULL
      ) OR s.drafted_by=$3::uuid OR s.submitted_by=$3::uuid)`;
    }
    return "(s.drafted_by=$3::uuid OR s.submitted_by=$3::uuid)";
  }

  private async assertDraftOwner(
    manager: EntityManager,
    scope: TenantParkScope,
    submissionId: string,
    actorId: string
  ): Promise<void> {
    const rows = await manager.query(
      `SELECT 1 FROM public.biz_party_identity_submission
       WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid
         AND status='draft' AND drafted_by=$4::uuid`,
      [scope.tenantId, scope.parkId, submissionId, actorId]
    ) as unknown[];
    if (!rows.length) throw propertyIdentityError("property-resource-not-found");
  }

  private async assertAssignmentEligibility(
    manager: EntityManager,
    scope: TenantParkScope,
    submissionId: string,
    actorId: string,
    supervisor: boolean,
    assignedOnly = false
  ): Promise<void> {
    const rows = await manager.query(
      `SELECT s.assigned_verifier_id,s.drafted_by,s.recorded_by,s.submitted_by,
              s.eligibility_policy_snapshot,q.status AS queue_status
       FROM public.biz_party_identity_submission s
       JOIN public.biz_party_identity_verification_queue q
         ON q.tenant_id=s.tenant_id AND q.park_id=s.park_id
        AND q.id=s.verification_queue_id
       WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.id=$3::uuid
         AND s.status='pending_verification'`,
      [scope.tenantId, scope.parkId, submissionId]
    ) as Array<{
      assigned_verifier_id: string | null;
      drafted_by: string | null;
      recorded_by: string | null;
      submitted_by: string | null;
      eligibility_policy_snapshot: Record<string, unknown>;
      queue_status: string;
    }>;
    const row = rows[0];
    if (!row) throw propertyIdentityError("property-resource-not-found");
    if ([row.drafted_by, row.recorded_by, row.submitted_by].includes(actorId)) {
      throw propertyIdentityError("identity-actor-separation-required");
    }
    if (supervisor && !this.isQueueSupervisor(row.eligibility_policy_snapshot, actorId)) {
      throw new ForbiddenException("Queue supervisor predicate is required");
    }
    if (!supervisor && row.queue_status !== "active") {
      throw propertyIdentityError("property-action-forbidden");
    }
    if (assignedOnly && row.assigned_verifier_id !== actorId) {
      throw propertyIdentityError("property-action-forbidden");
    }
  }

  private async assertVerifierPermission(
    manager: EntityManager,
    scope: TenantParkScope,
    submissionId: string,
    userId: string
  ): Promise<void> {
    const rows = await manager.query(
      `SELECT s.eligibility_policy_snapshot,
              s.drafted_by,s.recorded_by,s.submitted_by
       FROM public.biz_party_identity_submission s
       JOIN public.biz_party_identity_verification_queue queue
         ON queue.tenant_id=s.tenant_id AND queue.park_id=s.park_id
        AND queue.id=s.verification_queue_id
        AND queue.status='active'
       JOIN public.sys_user u
         ON u.tenant_id=s.tenant_id AND u.park_id=s.park_id
        AND u.id=$4::uuid
       JOIN public.sys_module asset_module
         ON asset_module.module_code='asset'
        AND asset_module.status=1 AND asset_module.is_deleted=false
       JOIN public.rel_tenant_module asset_assignment
         ON asset_assignment.tenant_id=u.tenant_id
        AND asset_assignment.park_id=u.park_id
        AND asset_assignment.module_id=asset_module.id
        AND asset_assignment.enabled=true
        AND asset_assignment.status='enabled'
        AND asset_assignment.is_deleted=false
        AND (asset_assignment.start_time IS NULL OR asset_assignment.start_time<=now())
        AND (asset_assignment.expire_time IS NULL OR asset_assignment.expire_time>now())
       JOIN public.rel_user_role ur
         ON ur.tenant_id=u.tenant_id AND ur.park_id=u.park_id
        AND ur.user_id=u.id AND ur.is_deleted=false
       JOIN public.rel_role_perm rp
         ON rp.tenant_id=ur.tenant_id AND rp.park_id=ur.park_id
        AND rp.role_id=ur.role_id AND rp.is_deleted=false
       JOIN public.sys_permission permission
         ON permission.tenant_id=rp.tenant_id AND permission.id=rp.permission_id
        AND permission.is_deleted=false AND permission.status='enabled'
       WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.id=$3::uuid
         AND s.status='pending_verification'
         AND u.is_deleted=false AND u.is_enabled=true AND u.status='enabled'
         AND permission.code=ANY($5::varchar[])
       GROUP BY s.id,u.id
       HAVING count(DISTINCT permission.code)=2
       LIMIT 1`,
      [
        scope.tenantId, scope.parkId, submissionId, userId,
        [
          PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
          PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY
        ]
      ]
    ) as Array<{
      eligibility_policy_snapshot: Record<string, unknown>;
      drafted_by: string | null;
      recorded_by: string | null;
      submitted_by: string | null;
    }>;
    const row = rows[0];
    if (
      !row
      || [row.drafted_by, row.recorded_by, row.submitted_by].includes(userId)
      || !this.frozenVerifierEligible(row.eligibility_policy_snapshot, userId)
    ) {
      throw propertyIdentityError("property-action-forbidden");
    }
  }

  private requestHash(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    actionId: IdentityActionId,
    targetId: string,
    body: unknown
  ): string {
    return createHash("sha256").update(this.stableStringify({
      method: actionId === "party.identity.update-draft" ? "PUT" : "POST",
      path: actionId === "party.identity.create-draft"
        ? "/property/identity-submissions"
        : [
          `/property/identity-submissions/${targetId}`,
          this.actionPath(actionId)
        ].filter(Boolean).join("/"),
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      actorId: actor.sub,
      actionId,
      targetId,
      body
    })).digest("hex");
  }

  private stableStringify(value: unknown): string {
    if (value === undefined) return "null";
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableStringify(item)}`)
        .join(",")}}`;
    }
    return JSON.stringify(value);
  }

  private eventType(actionId: IdentityActionId, body: Record<string, unknown>): string {
    const map: Record<IdentityActionId, string> = {
      "party.identity.create-draft": "draft-created",
      "party.identity.update-draft": "draft-updated",
      "party.identity.submit": "submitted",
      "party.identity.claim": "claimed",
      "party.identity.reassign": body.assignedVerifierId == null ? "revoked" : "reassigned",
      "party.identity.verify": String(body.decision),
      "party.identity.withdraw": "withdrawn"
    };
    return `party.identity.${map[actionId]}`;
  }

  private actionPath(actionId: IdentityActionId): string {
    return ({
      "party.identity.update-draft": "",
      "party.identity.submit": "submit",
      "party.identity.claim": "claim",
      "party.identity.reassign": "reassign",
      "party.identity.verify": "decisions",
      "party.identity.withdraw": "withdraw",
      "party.identity.create-draft": ""
    })[actionId];
  }

  private assertSupersedeTuple(dto: CreateIdentityDraftDto): void {
    const count = [
      dto.supersedesSubmissionId,
      dto.expectedSupersededStatus,
      dto.expectedSupersededVersion
    ].filter((value) => value !== undefined).length;
    if (count !== 0 && count !== 3) throw propertyIdentityError("property-validation-failed");
  }

  private assertDateRange(from?: string, to?: string): void {
    const fromTime = from ? Date.parse(from) : null;
    const toTime = to ? Date.parse(to) : null;
    if (
      (from && !Number.isFinite(fromTime))
      || (to && !Number.isFinite(toTime))
      || (fromTime !== null && toTime !== null && fromTime >= toTime)
    ) throw propertyIdentityError("property-validation-failed");
  }

  private pushFilter(
    where: string[],
    params: unknown[],
    column: string,
    value: unknown,
    cast = ""
  ): void {
    if (value === undefined) return;
    params.push(value);
    where.push(`${column}=$${params.length}${cast}`);
  }

  private isQueueSupervisor(snapshot: Record<string, unknown> | null, actorId: string): boolean {
    const ids = snapshot?.queueSupervisorUserIds;
    return Array.isArray(ids) && ids.includes(actorId);
  }

  private frozenVerifierEligible(
    snapshot: Record<string, unknown> | null,
    userId: string
  ): boolean {
    if (!snapshot) return false;
    const permissions = snapshot.requiredPermissions;
    const modules = snapshot.requiredModules;
    const exclusions = snapshot.actorExclusions;
    const eligibleVerifierUserIds = snapshot.eligibleVerifierUserIds;
    return Array.isArray(permissions)
      && permissions.includes(PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE)
      && permissions.includes(PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY)
      && Array.isArray(modules)
      && modules.includes("asset")
      && snapshot.relationScope === "tenant-park-current"
      && snapshot.dataScope === "party-submission"
      && Array.isArray(exclusions)
      && exclusions.includes("maker")
      && (
        eligibleVerifierUserIds === undefined
        || (
          Array.isArray(eligibleVerifierUserIds)
          && eligibleVerifierUserIds.includes(userId)
        )
      );
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }

  private time(value: unknown): string {
    return (value instanceof Date ? value : new Date(String(value))).toISOString();
  }
}
