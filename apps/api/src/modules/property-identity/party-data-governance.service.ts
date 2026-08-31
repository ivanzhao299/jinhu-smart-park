import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { createHash } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type {
  CreateConsentFactDto, CreateDataSubjectRequestDto, CreateLegalHoldDto,
  ClassifyLegacyRetentionDto, CompleteDataSubjectRequestDto, DecideDataSubjectRequestDto,
  ReleaseLegalHoldDto, UpdateRetentionPolicyDto, WithdrawConsentFactDto
} from "./dto/party-data-governance.dto";

@Injectable()
export class PartyDataGovernanceService {
  constructor(private readonly dataSource: DataSource, private readonly audit: AuditService) {}

  createConsent(scope: TenantParkScope, actor: JwtPrincipal, partyId: string,
    requestKey: string | undefined, dto: CreateConsentFactDto) {
    const key = this.key(requestKey);
    const requestHash = this.payloadHash(dto);
    if (dto.lawful_basis === "consent" && !dto.notice_version?.trim()) {
      throw new BadRequestException("notice_version is required for consent");
    }
    return this.dataSource.transaction(async (manager) => {
      await this.lockParty(manager, scope, partyId);
      const existing = await manager.query(
        `SELECT id::text,status,lawful_basis,processing_purpose,request_hash FROM public.biz_party_consent_fact
         WHERE tenant_id=$1 AND park_id=$2 AND party_id=$3::uuid AND request_key=$4`,
        [scope.tenantId, scope.parkId, partyId, key]
      ) as Array<Record<string, unknown>>;
      if (existing[0]) {
        this.assertRequestHash(existing[0].request_hash, requestHash);
        return { ...existing[0], request_hash: undefined, replayed: true };
      }
      const status = dto.lawful_basis === "consent" ? "granted" : "not_applicable";
      const rows = await manager.query(
        `INSERT INTO public.biz_party_consent_fact(
           tenant_id,park_id,party_id,status,lawful_basis,processing_purpose,notice_version,
           effective_at,channel,provenance,operator_id,request_key,request_hash,create_by
         ) VALUES($1,$2,$3::uuid,$4,$5,$6,$7,$8::timestamptz,$9,'operator_recorded',$10::uuid,$11,$12,$10)
         RETURNING id::text,status,lawful_basis,processing_purpose`,
        [scope.tenantId, scope.parkId, partyId, status, dto.lawful_basis,
          dto.processing_purpose, dto.notice_version?.trim() ?? null, dto.effective_at,
          dto.channel, actor.sub, key, requestHash]
      ) as Array<Record<string, unknown>>;
      const fact = rows[0];
      if (!fact) throw new Error("Consent fact was not created");
      await manager.query(
        `UPDATE public.biz_party SET current_consent_fact_id=$4::uuid,consent_status=$5,
           update_by=$3,update_time=now(),version=version+1
         WHERE tenant_id=$1 AND park_id=$2 AND id=$6::uuid`,
        [scope.tenantId, scope.parkId, actor.sub, fact.id,
          status === "granted" ? "granted" : "pending", partyId]
      );
      await this.requiredAudit(manager, scope, actor, key, "party.consent.record", partyId,
        { factId: fact.id, status, lawfulBasis: dto.lawful_basis, purpose: dto.processing_purpose }, partyId);
      return { ...fact, replayed: false };
    });
  }

  withdrawConsent(scope: TenantParkScope, actor: JwtPrincipal, partyId: string, factId: string,
    requestKey: string | undefined, dto: WithdrawConsentFactDto) {
    const key = this.key(requestKey);
    const requestHash = this.payloadHash(dto);
    return this.dataSource.transaction(async (manager) => {
      await this.lockParty(manager, scope, partyId);
      const existing = await manager.query(
        `SELECT id::text,status,request_hash FROM public.biz_party_consent_fact
         WHERE tenant_id=$1 AND park_id=$2 AND party_id=$3::uuid AND request_key=$4`,
        [scope.tenantId, scope.parkId, partyId, key]
      ) as Array<Record<string, unknown>>;
      if (existing[0]) {
        this.assertRequestHash(existing[0].request_hash, requestHash);
        return { ...existing[0], request_hash: undefined, replayed: true };
      }
      const source = await manager.query(
        `SELECT processing_purpose,notice_version,effective_at,channel FROM public.biz_party_consent_fact
         WHERE tenant_id=$1 AND park_id=$2 AND party_id=$3::uuid AND id=$4::uuid
           AND lawful_basis='consent' AND status='granted'
           AND id=(SELECT current_consent_fact_id FROM public.biz_party
             WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid)`,
        [scope.tenantId, scope.parkId, partyId, factId]
      ) as Array<Record<string, unknown>>;
      if (!source[0]) throw new ConflictException("Only a current evidenced grant can be withdrawn");
      const rows = await manager.query(
        `INSERT INTO public.biz_party_consent_fact(
          tenant_id,park_id,party_id,status,lawful_basis,processing_purpose,notice_version,
          effective_at,revoked_at,channel,provenance,operator_id,request_key,request_hash,create_by
         ) VALUES($1,$2,$3::uuid,'withdrawn','consent',$4,$5,$6,$7,$8,
          'operator_recorded',$9::uuid,$10,$11,$9) RETURNING id::text,status`,
        [scope.tenantId, scope.parkId, partyId, source[0].processing_purpose,
          source[0].notice_version, source[0].effective_at, dto.revoked_at,
          source[0].channel, actor.sub, key, requestHash]
      ) as Array<Record<string, unknown>>;
      const fact = rows[0];
      await manager.query(
        `UPDATE public.biz_party SET current_consent_fact_id=$4::uuid,consent_status='withdrawn',
          update_by=$3,update_time=now(),version=version+1
         WHERE tenant_id=$1 AND park_id=$2 AND id=$5::uuid`,
        [scope.tenantId, scope.parkId, actor.sub, fact?.id, partyId]
      );
      await this.requiredAudit(manager, scope, actor, key, "party.consent.withdraw", partyId,
        { factId: fact?.id, sourceFactId: factId, reasonCode: dto.reason_code }, partyId);
      return { ...fact, replayed: false };
    });
  }

  createSubjectRequest(scope: TenantParkScope, actor: JwtPrincipal, requestKey: string | undefined,
    dto: CreateDataSubjectRequestDto) {
    const key = this.key(requestKey);
    const requestHash = this.payloadHash(dto);
    return this.dataSource.transaction(async (manager) => {
      await this.lockParty(manager, scope, dto.party_id);
      const existing = await manager.query(
        `SELECT id::text,status,outcome,request_hash FROM public.biz_party_data_subject_request
         WHERE tenant_id=$1 AND park_id=$2 AND request_key=$3`, [scope.tenantId, scope.parkId, key]
      ) as Array<Record<string, unknown>>;
      if (existing[0]) {
        this.assertRequestHash(existing[0].request_hash, requestHash);
        return { ...existing[0], request_hash: undefined, replayed: true };
      }
      const rows = await manager.query(
        `INSERT INTO public.biz_party_data_subject_request(
          tenant_id,park_id,party_id,request_type,reason_code,channel,requested_by,request_key,request_hash
         ) VALUES($1,$2,$3::uuid,$4,$5,$6,$7::uuid,$8,$9) RETURNING id::text,status,outcome`,
        [scope.tenantId, scope.parkId, dto.party_id, dto.request_type, dto.reason_code,
          dto.channel, actor.sub, key, requestHash]
      ) as Array<Record<string, unknown>>;
      const request = rows[0];
      await this.requiredAudit(manager, scope, actor, key, "party.data-subject.request", dto.party_id,
        { requestId: request?.id, requestType: dto.request_type, status: "submitted" }, dto.party_id);
      return { ...request, replayed: false };
    });
  }

  async decideSubjectRequest(scope: TenantParkScope, actor: JwtPrincipal, id: string,
    requestKey: string | undefined, dto: DecideDataSubjectRequestDto) {
    const key = this.key(requestKey);
    const requestHash = this.payloadHash(dto);
    return this.dataSource.transaction(async (manager) => {
      const replay = await this.actionReplay(manager, scope, key, "subject-request-decision", id, requestHash);
      if (replay) return { ...replay, replayed: true };
      const rows = await manager.query(
        `UPDATE public.biz_party_data_subject_request SET status=$4,
          outcome=CASE WHEN $4='rejected' THEN 'rejected' ELSE NULL END,decision_code=$5,
          decided_at=now(),decided_by=$3::uuid,decision_request_key=$7,update_time=now()
         WHERE tenant_id=$1 AND park_id=$2 AND id=$6::uuid AND status='submitted'
         RETURNING id::text,party_id::text,status`,
        [scope.tenantId, scope.parkId, actor.sub, dto.decision, dto.decision_code, id, key]
      ) as Array<Record<string, unknown>>;
      if (!rows[0]) throw new ConflictException("Data-subject request is not awaiting decision");
      await this.requiredAudit(manager, scope, actor, key, "party.data-subject.decide", id,
          { requestId: id, decision: dto.decision,
            actualOutcome: dto.decision === "approved" ? null : "rejected" }, String(rows[0].party_id));
      const result = { id, status: dto.decision, actualOutcome: dto.decision === "approved" ? null : "rejected" };
      await this.saveActionReceipt(manager, scope, actor, key, "subject-request-decision", id, requestHash, result);
      return { ...result, replayed: false };
    });
  }

  async getSubjectRequest(scope: TenantParkScope, id: string) {
    const rows = await this.dataSource.query(
      `SELECT id::text,party_id::text,request_type,status,outcome,reason_code,channel,
        requested_at,requested_by::text,decided_at,decided_by::text,decision_code,
        completed_at,completed_by::text
       FROM public.biz_party_data_subject_request
       WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid`,
      [scope.tenantId, scope.parkId, id]
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new NotFoundException("Data-subject request not found");
    return rows[0];
  }

  completeSubjectRequest(scope: TenantParkScope, actor: JwtPrincipal, id: string,
    requestKey: string | undefined, dto: CompleteDataSubjectRequestDto) {
    const key = this.key(requestKey);
    const requestHash = this.payloadHash(dto);
    return this.dataSource.transaction(async (manager) => {
      const replay = await this.actionReplay(manager, scope, key, "subject-request-complete", id, requestHash);
      if (replay) return { ...replay, replayed: true };
      const rows = await manager.query(
        `SELECT id::text,party_id::text,request_type FROM public.biz_party_data_subject_request
         WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid AND status='approved' FOR UPDATE`,
        [scope.tenantId, scope.parkId, id]
      ) as Array<Record<string, unknown>>;
      if (!rows[0]) throw new ConflictException("Data-subject request is not approved for completion");
      const partyId = String(rows[0].party_id);
      await this.lockParty(manager, scope, partyId);
      const holds = await manager.query(
        `SELECT 1 FROM public.biz_party_identity_legal_hold
         WHERE tenant_id=$1 AND park_id=$2 AND party_id=$3::uuid AND status='active' LIMIT 1`,
        [scope.tenantId, scope.parkId, partyId]
      ) as unknown[];
      await manager.query(
        `UPDATE public.biz_party SET processing_restricted_at=COALESCE(processing_restricted_at,now()),
           processing_restriction_reason=$4,processing_restriction_request_id=$5::uuid,
           update_by=$3,update_time=now(),version=version+1
         WHERE tenant_id=$1 AND park_id=$2 AND id=$6::uuid`,
        [scope.tenantId, scope.parkId, actor.sub, dto.completion_code, id, partyId]
      );
      await manager.query(
        `UPDATE public.biz_party_data_subject_request SET status='completed',
           outcome='processing_restricted',completed_at=now(),completed_by=$3::uuid,update_time=now()
         WHERE tenant_id=$1 AND park_id=$2 AND id=$4::uuid`,
        [scope.tenantId, scope.parkId, actor.sub, id]
      );
      const result = { id, status: "completed", requestedAction: rows[0].request_type,
        actualOutcome: "processing_restricted", legalHoldActive: Boolean(holds[0]) };
      await this.requiredAudit(manager, scope, actor, key, "party.data-subject.complete", id,
        { requestId: id, requestedAction: rows[0].request_type,
          actualOutcome: "processing_restricted", legalHoldActive: Boolean(holds[0]) }, partyId);
      await this.saveActionReceipt(manager, scope, actor, key, "subject-request-complete", id, requestHash, result);
      return { ...result, replayed: false };
    });
  }

  createLegalHold(scope: TenantParkScope, actor: JwtPrincipal, requestKey: string | undefined,
    dto: CreateLegalHoldDto) {
    const key = this.key(requestKey);
    const requestHash = this.payloadHash(dto);
    return this.dataSource.transaction(async (manager) => {
      await this.lockParty(manager, scope, dto.party_id);
      const replay = await this.actionReplay(manager, scope, key, "legal-hold-create", dto.party_id, requestHash);
      if (replay) return { ...replay, replayed: true };
      if (dto.category && dto.object_id) {
        const assignments = await manager.query(
          `SELECT 1 FROM public.biz_party_identity_retention_assignment
           WHERE tenant_id=$1 AND park_id=$2 AND party_id=$3::uuid
             AND category=$4 AND object_id=$5::uuid`,
          [scope.tenantId, scope.parkId, dto.party_id, dto.category, dto.object_id]
        ) as unknown[];
        if (!assignments[0]) throw new BadRequestException("Legal-hold object does not belong to the Party");
      } else if (dto.category || dto.object_id) {
        throw new BadRequestException("Legal-hold category and object_id must be provided together");
      }
      const rows = await manager.query(
        `INSERT INTO public.biz_party_identity_legal_hold(
          tenant_id,park_id,party_id,category,object_id,reason_code,started_by,request_key
         ) VALUES($1,$2,$3::uuid,$4,$5::uuid,$6,$7::uuid,$8)
         ON CONFLICT(tenant_id,park_id,request_key) DO UPDATE SET request_key=EXCLUDED.request_key
         RETURNING id::text,status`,
        [scope.tenantId, scope.parkId, dto.party_id, dto.category ?? null,
          dto.object_id ?? null, dto.reason_code, actor.sub, key]
      ) as Array<Record<string, unknown>>;
      await this.requiredAudit(manager, scope, actor, key, "party.retention.hold", dto.party_id,
        { holdId: rows[0]?.id, category: dto.category ?? "all", status: "active" }, dto.party_id);
      const result = { ...rows[0], replayed: false };
      await this.saveActionReceipt(manager, scope, actor, key, "legal-hold-create", dto.party_id, requestHash, result);
      return result;
    });
  }

  releaseLegalHold(scope: TenantParkScope, actor: JwtPrincipal, id: string,
    requestKey: string | undefined, dto: ReleaseLegalHoldDto) {
    const key = this.key(requestKey);
    const requestHash = this.payloadHash(dto);
    return this.dataSource.transaction(async (manager) => {
      const replay = await this.actionReplay(manager, scope, key, "legal-hold-release", id, requestHash);
      if (replay) return { ...replay, replayed: true };
      const rows = await manager.query(
        `UPDATE public.biz_party_identity_legal_hold SET status='released',released_at=now(),
           released_by=$3::uuid,release_request_key=$5,release_reason_code=$6
         WHERE tenant_id=$1 AND park_id=$2 AND id=$4::uuid AND status='active'
         RETURNING id::text,party_id::text,status`,
        [scope.tenantId, scope.parkId, actor.sub, id, key, dto.reason_code]
      ) as Array<Record<string, unknown>>;
      if (!rows[0]) throw new ConflictException("Legal hold is not active");
      await manager.query(
        `UPDATE public.biz_party_identity_retention_assignment assignment SET
           state=CASE WHEN assignment.retention_until<=now() THEN 'due' ELSE 'active' END,update_time=now()
         FROM public.biz_party_identity_legal_hold hold
         WHERE hold.tenant_id=$1 AND hold.park_id=$2 AND hold.id=$3::uuid
           AND assignment.tenant_id=hold.tenant_id AND assignment.park_id=hold.park_id
           AND assignment.party_id=hold.party_id AND assignment.state='held'
           AND (hold.category IS NULL OR hold.category=assignment.category)
           AND (hold.object_id IS NULL OR hold.object_id=assignment.object_id)
           AND NOT EXISTS (SELECT 1 FROM public.biz_party_identity_legal_hold active_hold
             WHERE active_hold.tenant_id=assignment.tenant_id AND active_hold.park_id=assignment.park_id
               AND active_hold.party_id=assignment.party_id AND active_hold.status='active'
               AND (active_hold.category IS NULL OR active_hold.category=assignment.category)
               AND (active_hold.object_id IS NULL OR active_hold.object_id=assignment.object_id))`,
        [scope.tenantId, scope.parkId, id]
      );
      await this.requiredAudit(manager, scope, actor, key, "party.retention.hold.release", id,
        { holdId: id, status: "released", reasonCode: dto.reason_code }, String(rows[0].party_id));
      const result = { ...rows[0], replayed: false };
      await this.saveActionReceipt(manager, scope, actor, key, "legal-hold-release", id, requestHash, result);
      return result;
    });
  }

  async getStatus(scope: TenantParkScope, partyId: string) {
    const rows = await this.dataSource.query(
      `SELECT p.id::text,p.consent_status,p.processing_restricted_at,p.processing_restriction_reason,
        f.id::text AS fact_id,f.status AS fact_status,f.lawful_basis,f.processing_purpose,
        f.notice_version,f.effective_at,f.revoked_at,f.channel,f.provenance,f.observed_legacy_status
       FROM public.biz_party p LEFT JOIN public.biz_party_consent_fact f
        ON f.tenant_id=p.tenant_id AND f.park_id=p.park_id AND f.party_id=p.id
       AND f.id=p.current_consent_fact_id
       WHERE p.tenant_id=$1 AND p.park_id=$2 AND p.id=$3::uuid AND p.is_deleted=false`,
      [scope.tenantId, scope.parkId, partyId]
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new NotFoundException("Party not found");
    return rows[0];
  }

  async getRetentionPolicy(scope: TenantParkScope) {
    const rows = await this.dataSource.query(
      `SELECT * FROM public.biz_party_identity_retention_policy
       WHERE tenant_id=$1 AND park_id=$2`, [scope.tenantId, scope.parkId]
    ) as Array<Record<string, unknown>>;
    return rows[0] ?? {
      tenant_id: scope.tenantId, park_id: scope.parkId,
      submission_days: 730, submission_action: "restrict_processing",
      snapshot_days: 1825, snapshot_action: "restrict_processing",
      identity_photo_days: 730, identity_photo_action: "restrict_processing",
      protected_audit_days: 1825, protected_audit_action: "retain_restricted",
      legal_review_status: "pending_legal_review", version: 0, persisted: false
    };
  }

  updateRetentionPolicy(scope: TenantParkScope, actor: JwtPrincipal, requestKey: string | undefined,
    dto: UpdateRetentionPolicyDto) {
    const key = this.key(requestKey);
    const requestHash = this.payloadHash(dto);
    return this.dataSource.transaction(async (manager) => {
      const replay = await this.actionReplay(manager, scope, key, "retention-policy-update", null, requestHash);
      if (replay) return { ...replay, replayed: true };
      const rows = await manager.query(
        `INSERT INTO public.biz_party_identity_retention_policy(
          tenant_id,park_id,submission_days,submission_action,snapshot_days,snapshot_action,
          identity_photo_days,identity_photo_action,protected_audit_days,protected_audit_action,
          legal_review_status,create_by,update_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
         ON CONFLICT(tenant_id,park_id) DO UPDATE SET
          submission_days=EXCLUDED.submission_days,submission_action=EXCLUDED.submission_action,
          snapshot_days=EXCLUDED.snapshot_days,snapshot_action=EXCLUDED.snapshot_action,
          identity_photo_days=EXCLUDED.identity_photo_days,identity_photo_action=EXCLUDED.identity_photo_action,
          protected_audit_days=EXCLUDED.protected_audit_days,protected_audit_action=EXCLUDED.protected_audit_action,
          legal_review_status=EXCLUDED.legal_review_status,update_by=EXCLUDED.update_by,
          update_time=now(),version=public.biz_party_identity_retention_policy.version+1 RETURNING *`,
        [scope.tenantId,scope.parkId,dto.submission_days,dto.submission_action,
          dto.snapshot_days,dto.snapshot_action,dto.identity_photo_days,dto.identity_photo_action,
          dto.protected_audit_days,dto.protected_audit_action,dto.legal_review_status,actor.sub]
      ) as Array<Record<string, unknown>>;
      const result = rows[0] ?? {};
      await this.requiredAudit(manager, scope, actor, key, "party.retention.policy.update", null,
        { version: result.version, legalReviewStatus: dto.legal_review_status });
      await this.saveActionReceipt(manager, scope, actor, key, "retention-policy-update", null, requestHash, result);
      return { ...result, replayed: false };
    });
  }

  classifyLegacyRetention(scope: TenantParkScope, actor: JwtPrincipal, requestKey: string | undefined,
    dto: ClassifyLegacyRetentionDto) {
    const key = this.key(requestKey);
    const limit = dto.limit ?? 100;
    const requestHash = this.payloadHash({ limit });
    return this.dataSource.transaction(async (manager) => {
      const replay = await this.actionReplay(manager, scope, key, "retention-classify-legacy", null, requestHash);
      if (replay) return { ...replay, replayed: true };
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`party-retention:${scope.tenantId}:${scope.parkId}`]);
      const policies = await manager.query(
        `SELECT legal_review_status FROM public.biz_party_identity_retention_policy
         WHERE tenant_id=$1 AND park_id=$2 FOR UPDATE`, [scope.tenantId, scope.parkId]
      ) as Array<Record<string, unknown>>;
      if (policies[0]?.legal_review_status !== "approved") {
        throw new ConflictException("Retention policy requires legal approval before legacy classification");
      }
      const rows = await manager.query(
        `WITH candidates AS (
           SELECT assignment.id,assignment.category,assignment.object_id,
             CASE assignment.category
               WHEN 'submission' THEN submission.create_time
               WHEN 'snapshot' THEN snapshot.create_time
               WHEN 'identity_photo' THEN file.create_time
               ELSE COALESCE(audit.create_time,assignment_audit.occurred_at,decision.create_time)
             END AS source_time
           FROM public.biz_party_identity_retention_assignment assignment
           LEFT JOIN public.biz_party_identity_submission submission
             ON assignment.category='submission' AND submission.id=assignment.object_id
            AND submission.tenant_id=assignment.tenant_id AND submission.park_id=assignment.park_id
           LEFT JOIN public.biz_party_identity_snapshot snapshot
             ON assignment.category='snapshot' AND snapshot.id=assignment.object_id
            AND snapshot.tenant_id=assignment.tenant_id AND snapshot.park_id=assignment.park_id
           LEFT JOIN public.sys_file file
             ON assignment.category='identity_photo' AND file.id=assignment.object_id
            AND file.tenant_id=assignment.tenant_id AND file.park_id=assignment.park_id
           LEFT JOIN public.sys_op_log audit
             ON assignment.category='protected_audit' AND audit.id=assignment.object_id
            AND audit.tenant_id=assignment.tenant_id AND audit.park_id=assignment.park_id
           LEFT JOIN public.biz_party_identity_assignment_audit assignment_audit
             ON assignment.category='protected_audit' AND assignment_audit.id=assignment.object_id
            AND assignment_audit.tenant_id=assignment.tenant_id
            AND assignment_audit.park_id=assignment.park_id
           LEFT JOIN public.biz_party_identity_decision decision
             ON assignment.category='protected_audit' AND decision.id=assignment.object_id
            AND decision.tenant_id=assignment.tenant_id AND decision.park_id=assignment.park_id
           WHERE assignment.tenant_id=$1 AND assignment.park_id=$2
             AND assignment.source='legacy_unknown' AND assignment.state='pending_classification'
           ORDER BY assignment.create_time,assignment.id LIMIT $3 FOR UPDATE OF assignment SKIP LOCKED
         )
         UPDATE public.biz_party_identity_retention_assignment assignment SET
           retention_until=candidates.source_time + make_interval(days=>CASE candidates.category
             WHEN 'submission' THEN policy.submission_days WHEN 'snapshot' THEN policy.snapshot_days
             WHEN 'identity_photo' THEN policy.identity_photo_days ELSE policy.protected_audit_days END),
           expiry_action=CASE candidates.category
             WHEN 'submission' THEN policy.submission_action WHEN 'snapshot' THEN policy.snapshot_action
             WHEN 'identity_photo' THEN policy.identity_photo_action ELSE policy.protected_audit_action END,
           state=CASE WHEN candidates.source_time + make_interval(days=>CASE candidates.category
             WHEN 'submission' THEN policy.submission_days WHEN 'snapshot' THEN policy.snapshot_days
             WHEN 'identity_photo' THEN policy.identity_photo_days ELSE policy.protected_audit_days END) <= now()
             THEN 'due' ELSE 'active' END,update_time=now()
         FROM candidates,public.biz_party_identity_retention_policy policy
         WHERE assignment.id=candidates.id AND candidates.source_time IS NOT NULL
           AND policy.tenant_id=$1 AND policy.park_id=$2 RETURNING assignment.id`,
        [scope.tenantId, scope.parkId, limit]
      ) as unknown[];
      const result = { classified: rows.length, replayed: false };
      await this.requiredAudit(manager, scope, actor, key, "party.retention.classify-legacy",
        null, result);
      await this.saveActionReceipt(manager, scope, actor, key, "retention-classify-legacy", null, requestHash, result);
      return result;
    });
  }

  executeRetentionDue(scope: TenantParkScope, actor: JwtPrincipal, requestKey: string | undefined,
    limit: number) {
    const key = this.key(requestKey);
    const requestHash = this.payloadHash({ limit });
    return this.dataSource.transaction(async (manager) => {
      const replay = await this.actionReplay(manager, scope, key, "retention-execute-due", null, requestHash);
      if (replay) return { ...replay, replayed: true };
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`party-retention:${scope.tenantId}:${scope.parkId}`]);
      const policies = await manager.query(
        `SELECT legal_review_status FROM public.biz_party_identity_retention_policy
         WHERE tenant_id=$1 AND park_id=$2 FOR UPDATE`, [scope.tenantId, scope.parkId]
      ) as Array<Record<string, unknown>>;
      if (policies[0]?.legal_review_status !== "approved") {
        throw new ConflictException("Retention policy requires legal approval before due execution");
      }
      const due = await manager.query(
        `SELECT a.id::text,a.party_id::text,a.category,a.expiry_action,
          EXISTS(SELECT 1 FROM public.biz_party_identity_legal_hold h
            WHERE h.tenant_id=a.tenant_id AND h.park_id=a.park_id AND h.party_id=a.party_id
              AND h.status='active' AND (h.category IS NULL OR h.category=a.category)
              AND (h.object_id IS NULL OR h.object_id=a.object_id)) AS held
         FROM public.biz_party_identity_retention_assignment a
         WHERE a.tenant_id=$1 AND a.park_id=$2 AND a.state IN ('active','due')
           AND a.retention_until<=now() ORDER BY a.retention_until,a.id LIMIT $3 FOR UPDATE OF a SKIP LOCKED`,
        [scope.tenantId,scope.parkId,limit]
      ) as Array<Record<string, unknown>>;
      let held = 0; let restricted = 0;
      const requestedActions: Record<string, number> = {};
      for (const item of due) {
        if (item.held) {
          held += 1;
          await manager.query(`UPDATE public.biz_party_identity_retention_assignment
            SET state='held',update_time=now() WHERE id=$1::uuid`, [item.id]);
          continue;
        }
        const requestedAction = String(item.expiry_action);
        requestedActions[requestedAction] = (requestedActions[requestedAction] ?? 0) + 1;
        restricted += 1;
        await manager.query(`UPDATE public.biz_party SET processing_restricted_at=COALESCE(processing_restricted_at,now()),
          processing_restriction_reason=COALESCE(processing_restriction_reason,'retention_expired'),
          update_by=$4,update_time=now(),version=version+1
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid`,
        [scope.tenantId,scope.parkId,item.party_id,actor.sub]);
        await manager.query(`UPDATE public.biz_party_identity_retention_assignment
          SET state='processing_restricted',update_time=now() WHERE id=$1::uuid`, [item.id]);
      }
      const result = { scanned: due.length, held, processingRestricted: restricted,
        requestedActions, actualAction: "processing_restricted", replayed: false };
      await this.requiredAudit(manager, scope, actor, key, "party.retention.execute-due", null, result);
      await this.saveActionReceipt(manager, scope, actor, key, "retention-execute-due", null, requestHash, result);
      return result;
    });
  }

  private key(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length > 128) throw new BadRequestException("X-Idempotency-Key is required");
    return key;
  }

  private payloadHash(value: unknown): string {
    const canonical = (input: unknown): unknown => {
      if (Array.isArray(input)) return input.map(canonical);
      if (input && typeof input === "object") {
        return Object.fromEntries(Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right, "en"))
          .map(([key, child]) => [key, canonical(child)]));
      }
      return input;
    };
    return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
  }

  private assertRequestHash(stored: unknown, expected: string): void {
    if (stored !== expected) throw new ConflictException("Idempotency key was reused with a different request");
  }

  private async actionReplay(manager: EntityManager, scope: TenantParkScope, key: string,
    action: string, targetId: string | null, requestHash: string): Promise<Record<string, unknown> | null> {
    const rows = await manager.query(
      `SELECT action,target_id::text,request_hash,result_json FROM public.biz_party_data_governance_action_receipt
       WHERE tenant_id=$1 AND park_id=$2 AND request_key=$3`, [scope.tenantId,scope.parkId,key]
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) return null;
    const expectedTarget = targetId ?? "00000000-0000-0000-0000-000000000000";
    if (rows[0].action !== action || String(rows[0].target_id) !== expectedTarget) {
      throw new ConflictException("Idempotency key was already used for another governance action");
    }
    this.assertRequestHash(rows[0].request_hash, requestHash);
    return rows[0].result_json as Record<string, unknown>;
  }

  private saveActionReceipt(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal,
    key: string, action: string, targetId: string | null, requestHash: string,
    result: Record<string, unknown>) {
    return manager.query(
      `INSERT INTO public.biz_party_data_governance_action_receipt(
        tenant_id,park_id,request_key,action,target_id,request_hash,result_json,actor_id)
       VALUES($1,$2,$3,$4,COALESCE($5::uuid,'00000000-0000-0000-0000-000000000000'::uuid),$6,$7::jsonb,$8::uuid)`,
      [scope.tenantId,scope.parkId,key,action,targetId,requestHash,JSON.stringify(result),actor.sub]);
  }

  private async lockParty(manager: EntityManager, scope: TenantParkScope, partyId: string): Promise<void> {
    const rows = await manager.query(
      `SELECT id FROM public.biz_party WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid
       AND is_deleted=false FOR UPDATE`, [scope.tenantId, scope.parkId, partyId]
    ) as unknown[];
    if (!rows[0]) throw new NotFoundException("Party not found");
  }

  private async requiredAudit(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal,
    key: string, action: string, bizId: string | null, afterJson: Record<string, unknown>,
    retentionPartyId?: string) {
    await this.audit.recordOperationRequired({
      tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub,
      username: actor.username, realName: actor.realName ?? null, roleCodes: actor.roles,
      module: "property-identity", resource: "party-data-governance", action,
      bizType: "party_data_governance", bizId, afterJson, method: "INTERNAL",
      path: "party-data-governance", success: true, requestId: key, idempotencyKey: key
    }, manager);
    const auditRows = await manager.query(
      `SELECT id::text,create_time FROM public.sys_op_log
       WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3 AND biz_type='party_data_governance'
       ORDER BY create_time DESC LIMIT 1`, [scope.tenantId,scope.parkId,key]
    ) as Array<Record<string, unknown>>;
    if (!auditRows[0]) throw new Error("Required governance audit was not persisted");
    if (!retentionPartyId) return;
    await manager.query(
      `INSERT INTO public.biz_party_identity_retention_policy(tenant_id,park_id) VALUES($1,$2)
       ON CONFLICT(tenant_id,park_id) DO NOTHING`, [scope.tenantId,scope.parkId]);
    await manager.query(
      `INSERT INTO public.biz_party_identity_retention_assignment(
        tenant_id,park_id,party_id,category,object_id,retention_until,expiry_action,state,source)
       SELECT $1,$2,$3::uuid,'protected_audit',$4::uuid,$5::timestamptz + make_interval(days=>policy.protected_audit_days),
         policy.protected_audit_action,'active','policy'
       FROM public.biz_party_identity_retention_policy policy
       WHERE policy.tenant_id=$1 AND policy.park_id=$2
       ON CONFLICT(tenant_id,park_id,category,object_id) DO NOTHING`,
      [scope.tenantId,scope.parkId,retentionPartyId,auditRows[0].id,auditRows[0].create_time]);
  }
}
