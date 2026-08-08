import { Injectable } from "@nestjs/common";
import {
  type ApprovalIncidentDetail,
  type ApprovalIncidentListItem,
  type ApprovalIncidentListQuery,
  type IncidentDetail,
  type IncidentListItem,
  type IncidentListQuery,
  type PropertyPaginatedResult,
  type TenantParkScope,
  type TrackBApprovalActionId
} from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import { createHash, randomUUID } from "node:crypto";
import {
  type CanonicalInboxEvent,
  type EventReplayResult,
  type InboxConsumeInput,
  type InboxConsumeResult,
  type PropertyEventEnvelope,
  type PropertyEventRuntimeStore
} from "./property-event-runtime.contracts";
import { hashCanonicalPropertyEvent } from "./property-event-canonical";
import { propertyApprovalError } from "../property-approval.error";

type Row = Record<string, unknown>;
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
const nullableIso = (value: unknown) => value == null ? null : iso(value);
const number = (value: unknown) => Number(value);
const string = (value: unknown) => String(value);

@Injectable()
export class TypeOrmPropertyEventRuntimeStore implements PropertyEventRuntimeStore {
  constructor(private readonly dataSource: DataSource) {}

  async claimPublishable(input: {
    workerId: string;
    limit: number;
    leaseSeconds: number;
    authorize: (manager: EntityManager, scope: TenantParkScope) => Promise<boolean>;
  }): Promise<PropertyEventEnvelope[]> {
    return this.dataSource.transaction(async (manager) => {
      const scopeRows = await manager.query(
        `SELECT DISTINCT tenant_id,park_id
           FROM biz_property_outbox
          WHERE (status IN ('pending','retry_wait')
             AND (next_retry_at IS NULL OR next_retry_at<=clock_timestamp()))
             OR (status='publishing' AND lease_expires_at<=clock_timestamp())
          ORDER BY tenant_id,park_id`
      ) as Array<{ tenant_id: string; park_id: string }>;
      const authorizedScopes: TenantParkScope[] = [];
      for (const row of scopeRows) {
        const scope = { tenantId: row.tenant_id, parkId: row.park_id };
        if (await input.authorize(manager, scope)) authorizedScopes.push(scope);
      }
      if (!authorizedScopes.length) return [];
      const claimToken = randomUUID();
      const rows = mutationRows(await manager.query(
      `WITH candidates AS (
         SELECT candidate.event_id
         FROM biz_property_outbox candidate
         WHERE (
           (candidate.status IN ('pending','retry_wait')
             AND (candidate.next_retry_at IS NULL OR candidate.next_retry_at <= clock_timestamp()))
           OR (candidate.status='publishing' AND candidate.lease_expires_at <= clock_timestamp())
         )
         AND EXISTS (
           SELECT 1
             FROM jsonb_to_recordset($5::jsonb)
               AS authorized(tenant_id text,park_id text)
            WHERE authorized.tenant_id=candidate.tenant_id::text
              AND authorized.park_id=candidate.park_id::text
         )
         AND NOT EXISTS (
           SELECT 1 FROM biz_property_outbox prior
           WHERE prior.tenant_id=candidate.tenant_id AND prior.park_id=candidate.park_id
             AND prior.ordering_key=candidate.ordering_key
             AND (prior.sequence,prior.event_ordinal) <
                 (candidate.sequence,candidate.event_ordinal)
             AND prior.status <> 'published'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM biz_property_outbox isolated_event
           JOIN biz_property_event_dlq isolation
             ON isolation.tenant_id=isolated_event.tenant_id
            AND isolation.park_id=isolated_event.park_id
            AND isolation.original_event_id=isolated_event.event_id
           WHERE isolated_event.tenant_id=candidate.tenant_id
             AND isolated_event.park_id=candidate.park_id
             AND isolated_event.ordering_key=candidate.ordering_key
             AND isolated_event.sequence<=candidate.sequence
             AND isolation.failure_side='consumer'
             AND isolation.status IN ('active','replaying','quarantined')
             AND isolation.error_code='event-checksum-mismatch'
         )
         ORDER BY candidate.created_at,candidate.event_id
         FOR UPDATE SKIP LOCKED LIMIT $1
       )
       UPDATE biz_property_outbox target
       SET status='publishing', claim_epoch=target.claim_epoch+1,
           claim_token=$2, worker_id=$3,
           lease_expires_at=clock_timestamp()+($4 * interval '1 second'),
           next_retry_at=NULL, published_at=NULL, dlq_at=NULL
       FROM candidates
       WHERE target.event_id=candidates.event_id
       RETURNING target.*`,
      [
        input.limit, claimToken, input.workerId, input.leaseSeconds,
        JSON.stringify(authorizedScopes.map((scope) => ({
          tenant_id: scope.tenantId, park_id: scope.parkId
        })))
      ]
      ));
      return rows.map(this.mapEnvelope);
    });
  }

  async markPublished(event: PropertyEventEnvelope): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const result = mutationRows(await manager.query(
        `UPDATE biz_property_outbox
         SET status='published', published_at=clock_timestamp(),
             claim_token=NULL,worker_id=NULL,lease_expires_at=NULL,next_retry_at=NULL,dlq_at=NULL
         WHERE event_id=$1 AND status='publishing' AND claim_epoch=$2 AND claim_token=$3
         RETURNING event_id`,
        [event.eventId, event.claimEpoch, event.claimToken]
      ));
      if (result.length !== 1) return false;
      const dlqs = await manager.query(
        `SELECT * FROM biz_property_event_dlq
         WHERE original_event_id=$1 AND failure_side='publisher' AND status='replaying'
         FOR UPDATE`,
        [event.eventId]
      ) as Row[];
      if (dlqs.length) {
        const dlq = dlqs[0]!;
        if (dlq.payload_hash !== event.payloadHash) {
          throw propertyApprovalError("event-checksum-mismatch");
        }
        await manager.query(
          `UPDATE biz_property_event_dlq SET status='resolved',version=version+1
           WHERE id=$1 AND version=$2 AND status='replaying'`,
          [dlq.id, dlq.version]
        );
        const prior = await manager.query(
          `SELECT operator_id,incident_id,reason,payload_hash
           FROM biz_property_event_replay_audit
           WHERE tenant_id=$1 AND park_id=$2 AND dlq_id=$3
           ORDER BY created_at DESC,id DESC LIMIT 1`,
          [dlq.tenant_id, dlq.park_id, dlq.id]
        ) as Row[];
        if (prior.length) {
          const resultHash = createHash("sha256").update(JSON.stringify({
            dlqId: dlq.id, eventId: event.eventId, status: "resolved"
          })).digest("hex");
          await manager.query(
            `INSERT INTO biz_property_event_replay_audit(
              tenant_id,park_id,dlq_id,original_event_id,operator_id,incident_id,reason,
              before_status,after_status,payload_hash,result_hash
            ) VALUES($1,$2,$3,$4,$5,$6,$7,'replaying','resolved',$8,$9)`,
            [
              dlq.tenant_id, dlq.park_id, dlq.id, event.eventId,
              prior[0]!.operator_id, prior[0]!.incident_id, prior[0]!.reason,
              prior[0]!.payload_hash, resultHash
            ]
          );
        }
      }
      return true;
    });
  }

  async markPublishFailure(input: {
    event: PropertyEventEnvelope;
    errorCategory: string;
    errorCode: string;
    maxAttempts: number;
    retryAt: Date;
  }): Promise<"retry_wait" | "dlq" | "stale-claim"> {
    return this.dataSource.transaction(async (manager) => {
      const rows = mutationRows(await manager.query(
        `UPDATE biz_property_outbox
         SET attempt_count=attempt_count+1,
             status=CASE WHEN attempt_count+1 >= $4 THEN 'dlq' ELSE 'retry_wait' END,
             next_retry_at=CASE WHEN attempt_count+1 >= $4 THEN NULL ELSE $5::timestamptz END,
             dlq_at=CASE WHEN attempt_count+1 >= $4 THEN clock_timestamp() ELSE NULL END,
             claim_token=NULL,worker_id=NULL,lease_expires_at=NULL,published_at=NULL
         WHERE event_id=$1 AND status='publishing' AND claim_epoch=$2 AND claim_token=$3
         RETURNING *`,
        [
          input.event.eventId, input.event.claimEpoch, input.event.claimToken,
          input.maxAttempts, input.retryAt
        ]
      ));
      if (!rows.length) return "stale-claim" as const;
      const row = rows[0]!;
      if (row.status !== "dlq") return "retry_wait" as const;
      await manager.query(
        `INSERT INTO biz_property_event_dlq(
           tenant_id,park_id,original_event_id,consumer_name,payload_hash,
           failure_side,error_category,error_code,attempt_count,
           first_failed_at,last_failed_at,status
         ) VALUES($1,$2,$3,'__publisher__',$4,'publisher',$5,$6,$7,
                  clock_timestamp(),clock_timestamp(),'active')
         ON CONFLICT (tenant_id,park_id,original_event_id,consumer_name,failure_side)
         DO UPDATE SET error_category=EXCLUDED.error_category,error_code=EXCLUDED.error_code,
           attempt_count=EXCLUDED.attempt_count,last_failed_at=clock_timestamp(),
           version=biz_property_event_dlq.version+1,status='active'`,
        [
          row.tenant_id, row.park_id, row.event_id, row.payload_hash,
          input.errorCategory, input.errorCode, row.attempt_count
        ]
      );
      return "dlq" as const;
    });
  }

  async consumeInbox<T>(
    input: InboxConsumeInput,
    handler: (manager: EntityManager, event: Readonly<CanonicalInboxEvent>) => Promise<{
      result: T; resultHash: string; resultReference?: string | null;
    }>
  ): Promise<InboxConsumeResult<T>> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const source = await manager.query(
        `SELECT event_id,tenant_id,park_id,event_type,event_version,ordering_key,
                sequence,event_ordinal,payload,payload_hash,status
         FROM biz_property_outbox
         WHERE tenant_id=$1 AND park_id=$2 AND event_id=$3
         FOR UPDATE`,
        [input.scope.tenantId, input.scope.parkId, input.event.eventId]
      ) as Row[];
      if (!source.length) throw propertyApprovalError("property-resource-not-found");
      const row = source[0]!;
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [
          `${input.scope.tenantId}:${input.scope.parkId}:`
          + `${input.consumerName}:${string(row.ordering_key)}`
        ]
      );
      const canonicalPayload = row.payload as Record<string, unknown>;
      const canonicalPayloadHash = hashCanonicalPropertyEvent(canonicalPayload);
      let claimedPayloadHash = "";
      try {
        claimedPayloadHash = hashCanonicalPropertyEvent(input.event.payload);
      } catch {
        claimedPayloadHash = "invalid";
      }
      if (
        canonicalPayloadHash !== string(row.payload_hash)
        || string(row.payload_hash) !== input.event.payloadHash
        || claimedPayloadHash !== input.event.payloadHash
      ) {
        await this.quarantineChecksumMismatch(manager, input, canonicalPayloadHash);
        return { checksumMismatch: true } as const;
      }
      if (row.status !== "published") throw propertyApprovalError("property-version-conflict");
      const canonicalEvent: CanonicalInboxEvent = {
        eventId: string(row.event_id),
        tenantId: string(row.tenant_id),
        parkId: string(row.park_id),
        eventType: string(row.event_type),
        eventVersion: number(row.event_version),
        orderingKey: string(row.ordering_key),
        sequence: string(row.sequence),
        eventOrdinal: number(row.event_ordinal),
        payload: canonicalPayload,
        payloadHash: canonicalPayloadHash,
        ...(input.event.replayDlqId ? { replayDlqId: input.event.replayDlqId } : {}),
        ...(input.event.replayDlqVersion == null
          ? {} : { replayDlqVersion: input.event.replayDlqVersion })
      };
      const prior = await manager.query(
        `SELECT payload_hash,result_hash,result_reference
         FROM biz_property_inbox
         WHERE tenant_id=$1 AND park_id=$2 AND consumer_name=$3 AND event_id=$4`,
        [input.scope.tenantId, input.scope.parkId, input.consumerName, input.event.eventId]
      ) as Row[];
      if (prior.length) {
        const existing = prior[0]!;
        if (existing.payload_hash !== canonicalPayloadHash) {
          await this.quarantineChecksumMismatch(manager, input, canonicalPayloadHash);
          return { checksumMismatch: true } as const;
        }
        return { checksumMismatch: false as const, value: {
          duplicate: true,
          result: undefined as T,
          resultHash: string(existing.result_hash),
          resultReference: existing.result_reference == null
            ? null : string(existing.result_reference)
        }};
      }
      const orderingBlock = await manager.query(
        `SELECT
           EXISTS (
             SELECT 1
             FROM biz_property_outbox prior_event
             WHERE prior_event.tenant_id=$1 AND prior_event.park_id=$2
               AND prior_event.ordering_key=$3
               AND (prior_event.sequence,prior_event.event_ordinal)<($4::bigint,$5::integer)
               AND NOT EXISTS (
                 SELECT 1 FROM biz_property_inbox prior_receipt
                 WHERE prior_receipt.tenant_id=prior_event.tenant_id
                   AND prior_receipt.park_id=prior_event.park_id
                   AND prior_receipt.consumer_name=$6
                   AND prior_receipt.event_id=prior_event.event_id
               )
           ) AS has_unhandled_prior,
           (
             SELECT count(DISTINCT existing_sequence.sequence)
             FROM biz_property_outbox existing_sequence
             WHERE existing_sequence.tenant_id=$1 AND existing_sequence.park_id=$2
               AND existing_sequence.ordering_key=$3
               AND existing_sequence.sequence<$4::bigint
           ) <> $4::bigint-1 AS has_sequence_gap`,
        [
          input.scope.tenantId, input.scope.parkId, canonicalEvent.orderingKey,
          canonicalEvent.sequence, canonicalEvent.eventOrdinal, input.consumerName
        ]
      ) as Row[];
      if (
        orderingBlock[0]?.has_unhandled_prior === true
        || orderingBlock[0]?.has_sequence_gap === true
      ) throw propertyApprovalError("property-version-conflict");

      const handled = await handler(manager, canonicalEvent);
      await manager.query(
        `INSERT INTO biz_property_inbox(
           tenant_id,park_id,consumer_name,consumer_version,event_id,event_type,event_version,
           ordering_key,sequence,payload_hash,result_hash,result_reference
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          input.scope.tenantId, input.scope.parkId, input.consumerName,
          input.consumerVersion, canonicalEvent.eventId, canonicalEvent.eventType,
          canonicalEvent.eventVersion, canonicalEvent.orderingKey, canonicalEvent.sequence,
          canonicalEvent.payloadHash, handled.resultHash, handled.resultReference ?? null
        ]
      );
      if (canonicalEvent.replayDlqId && canonicalEvent.replayDlqVersion != null) {
        const completed = await this.completeConsumerReplay(manager, {
          dlqId: canonicalEvent.replayDlqId,
          eventId: canonicalEvent.eventId,
          consumerName: input.consumerName,
          expectedDlqVersion: canonicalEvent.replayDlqVersion,
          inboxResultHash: handled.resultHash
        });
        if (!completed) throw propertyApprovalError("property-version-conflict");
      }
      return { checksumMismatch: false as const, value: {
        duplicate: false, result: handled.result, resultHash: handled.resultHash,
        resultReference: handled.resultReference ?? null
      }};
    });
    if (outcome.checksumMismatch) throw propertyApprovalError("event-checksum-mismatch");
    return outcome.value;
  }

  async listEventIncidents(
    scope: TenantParkScope, query: IncidentListQuery
  ): Promise<PropertyPaginatedResult<IncidentListItem, never>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const filters: string[] = ["tenant_id=$1", "park_id=$2"];
    const params: unknown[] = [scope.tenantId, scope.parkId];
    const add = (sql: string, value: unknown) => {
      params.push(value); filters.push(`${sql}=$${params.length}`);
    };
    if (query.eventId) add("original_event_id", query.eventId);
    if (query.failureSide) add("failure_side", query.failureSide);
    if (query.consumerName) add("consumer_name", query.consumerName);
    if (query.status) add("status", query.status);
    const where = filters.join(" AND ");
    const countRows = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM biz_property_event_dlq WHERE ${where}`, params
    ) as Row[];
    const sort = query.sort === "createdAt" ? "created_at" : "last_failed_at";
    const order = query.order === "asc" ? "ASC" : "DESC";
    const rows = await this.dataSource.query(
      `SELECT * FROM biz_property_event_dlq WHERE ${where}
       ORDER BY ${sort} ${order},id ${order}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    ) as Row[];
    return {
      items: rows.map(this.mapEventIncident),
      page, pageSize, total: number(countRows[0]?.total ?? 0), allowedActions: []
    };
  }

  async getEventIncident(scope: TenantParkScope, dlqId: string): Promise<IncidentDetail | null> {
    const rows = await this.dataSource.query(
      `SELECT * FROM biz_property_event_dlq
       WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
      [scope.tenantId, scope.parkId, dlqId]
    ) as Row[];
    return rows.length ? this.mapEventIncident(rows[0]!) : null;
  }

  async prepareEventReplay(input: {
    scope: TenantParkScope; actorId: string; dlqId: string;
    command: { clientKey: string; incidentId: string; reason: string; expectedDlqVersion: number };
    authorize: (manager: EntityManager) => Promise<void>;
  }): Promise<EventReplayResult | null> {
    return this.dataSource.transaction(async (manager) => {
      await input.authorize(manager);
      if (!input.command.reason.trim()) {
        throw propertyApprovalError("property-validation-failed", { field: "reason" });
      }
      const requestHash = createHash("sha256").update(JSON.stringify({
        dlqId: input.dlqId,
        incidentId: input.command.incidentId,
        reason: input.command.reason.trim(),
        expectedDlqVersion: input.command.expectedDlqVersion
      })).digest("hex");
      const receipts = await manager.query(
        `SELECT request_hash,receipt_status,result_ref FROM biz_property_mutation_receipt
         WHERE tenant_id=$1 AND park_id=$2 AND actor_id=$3
           AND action_id='property.event.replay' AND target_id=$4 AND client_key=$5
         FOR UPDATE`,
        [
          input.scope.tenantId, input.scope.parkId, input.actorId,
          input.dlqId, input.command.clientKey
        ]
      ) as Row[];
      if (receipts.length) {
        const receipt = receipts[0]!;
        if (receipt.request_hash !== requestHash) {
          throw propertyApprovalError("idempotency-key-conflict");
        }
        if (receipt.receipt_status === "completed") {
          const [eventId, version] = string(receipt.result_ref).split(":");
          return {
            dlqId: input.dlqId,
            eventId: eventId!,
            status: "replaying" as const,
            version: Number(version)
          };
        }
        throw propertyApprovalError("property-version-conflict");
      }
      await manager.query(
        `INSERT INTO biz_property_mutation_receipt(
          receipt_contract_version,tenant_id,park_id,actor_id,action_id,target_id,
          client_key,request_hash
        ) VALUES('legacy-v1',$1,$2,$3,'property.event.replay',$4,$5,$6)`,
        [
          input.scope.tenantId, input.scope.parkId, input.actorId,
          input.dlqId, input.command.clientKey, requestHash
        ]
      );
      const locked = await manager.query(
        `SELECT * FROM biz_property_event_dlq
         WHERE tenant_id=$1 AND park_id=$2 AND id=$3 FOR UPDATE`,
        [input.scope.tenantId, input.scope.parkId, input.dlqId]
      ) as Row[];
      if (!locked.length) throw propertyApprovalError("property-resource-not-found");
      const row = locked[0]!;
      if (
        number(row.version) !== input.command.expectedDlqVersion
        || !["active", "quarantined"].includes(string(row.status))
      ) throw propertyApprovalError("property-version-conflict", {
        latestVersion: number(row.version)
      });
      const beforeStatus = string(row.status);
      const quarantine = async (): Promise<EventReplayResult> => {
        await manager.query(
          `UPDATE biz_property_event_dlq
           SET status='quarantined',version=version+1,last_replay_at=clock_timestamp(),
               incident_id=$4
           WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
          [
            input.scope.tenantId, input.scope.parkId, input.dlqId,
            input.command.incidentId
          ]
        );
        await manager.query(
          `INSERT INTO biz_property_event_replay_audit(
             tenant_id,park_id,dlq_id,original_event_id,operator_id,incident_id,reason,
             before_status,after_status,payload_hash
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'quarantined',$9)`,
          [
            input.scope.tenantId, input.scope.parkId, input.dlqId,
            row.original_event_id, input.actorId, input.command.incidentId,
            input.command.reason.trim(), beforeStatus, row.payload_hash
          ]
        );
        await manager.query(
          `UPDATE biz_property_mutation_receipt SET receipt_status='failed'
           WHERE tenant_id=$1 AND park_id=$2 AND actor_id=$3
             AND action_id='property.event.replay' AND target_id=$4 AND client_key=$5`,
          [
            input.scope.tenantId, input.scope.parkId, input.actorId,
            input.dlqId, input.command.clientKey
          ]
        );
        return {
          dlqId: input.dlqId,
          eventId: string(row.original_event_id),
          status: "quarantined",
          version: number(row.version) + 1
        };
      };
      if (row.failure_side === "publisher") {
        const publisherEvent = await manager.query(
          `SELECT status,payload_hash FROM biz_property_outbox
           WHERE tenant_id=$1 AND park_id=$2 AND event_id=$3 FOR UPDATE`,
          [input.scope.tenantId, input.scope.parkId, row.original_event_id]
        ) as Row[];
        if (
          !publisherEvent.length
          || publisherEvent[0]!.status !== "dlq"
          || publisherEvent[0]!.payload_hash !== row.payload_hash
        ) return quarantine();
        const publisherRows = mutationRows(await manager.query(
          `UPDATE biz_property_outbox
           SET status='publishing',claim_epoch=claim_epoch+1,
               claim_token=uuid_generate_v4(),worker_id='manual-replay',
               lease_expires_at=clock_timestamp(),
               next_retry_at=NULL,published_at=NULL,dlq_at=NULL
           WHERE tenant_id=$1 AND park_id=$2 AND event_id=$3 AND status='dlq'
           RETURNING event_id`,
          [input.scope.tenantId, input.scope.parkId, row.original_event_id]
        ));
        if (!publisherRows.length) return quarantine();
      } else if (row.notification_delivery_id != null) {
        const deliveryRows = await manager.query(
          `SELECT version,delivery_status FROM biz_property_notification_delivery
           WHERE tenant_id=$1 AND park_id=$2 AND id=$3 FOR UPDATE`,
          [input.scope.tenantId, input.scope.parkId, row.notification_delivery_id]
        ) as Row[];
        if (
          !deliveryRows.length
          || deliveryRows[0]!.delivery_status !== "delivery_exhausted"
        ) return quarantine();
        const deliveryVersion = number(deliveryRows[0]!.version);
        const resetRows = mutationRows(await manager.query(
          `UPDATE biz_property_notification_delivery
           SET delivery_status='pending',version=version+1,claim_token=NULL,
               lease_expires_at=NULL,next_retry_at=NULL,failed_at=NULL,exhausted_at=NULL,
               last_error_code=NULL,attempt_count=0
           WHERE tenant_id=$1 AND park_id=$2 AND id=$3
             AND delivery_status='delivery_exhausted' AND version=$4 RETURNING id`,
          [
            input.scope.tenantId, input.scope.parkId, row.notification_delivery_id,
            deliveryVersion
          ]
        ));
        if (!resetRows.length) return quarantine();
      }
      await manager.query(
        `UPDATE biz_property_event_dlq
         SET status='replaying',version=version+1,last_replay_at=clock_timestamp(),
             incident_id=$4
         WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
        [
          input.scope.tenantId, input.scope.parkId, input.dlqId,
          input.command.incidentId
        ]
      );
      await manager.query(
        `INSERT INTO biz_property_event_replay_audit(
           tenant_id,park_id,dlq_id,original_event_id,operator_id,incident_id,reason,
           before_status,after_status,payload_hash,result_hash
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'replaying',$9,$10)`,
        [
          input.scope.tenantId, input.scope.parkId, input.dlqId,
          row.original_event_id, input.actorId, input.command.incidentId,
          input.command.reason.trim(), beforeStatus, row.payload_hash,
          createHash("sha256").update(JSON.stringify({
            dlqId: input.dlqId, eventId: row.original_event_id, status: "replaying"
          })).digest("hex")
        ]
      );
      const resultHash = createHash("sha256").update(JSON.stringify({
        dlqId: input.dlqId, eventId: row.original_event_id,
        status: "replaying", version: number(row.version) + 1
      })).digest("hex");
      await manager.query(
        `UPDATE biz_property_mutation_receipt
         SET receipt_status='completed',result_ref=$6,result_hash=$7,
             completed_at=clock_timestamp()
         WHERE tenant_id=$1 AND park_id=$2 AND actor_id=$3
           AND action_id='property.event.replay' AND target_id=$4 AND client_key=$5`,
        [
          input.scope.tenantId, input.scope.parkId, input.actorId,
          input.dlqId, input.command.clientKey,
          `${string(row.original_event_id)}:${number(row.version) + 1}`,
          resultHash
        ]
      );
      return {
        dlqId: input.dlqId, eventId: string(row.original_event_id),
        status: "replaying" as const, version: number(row.version) + 1
      };
    });
  }

  async listReplayingEvents(input: {
    limit: number;
    authorize: (manager: EntityManager, scope: TenantParkScope) => Promise<boolean>;
  }): Promise<PropertyEventEnvelope[]> {
    return this.dataSource.transaction(async (manager) => {
      const scopeRows = await manager.query(
        `SELECT DISTINCT d.tenant_id,d.park_id
           FROM biz_property_event_dlq d
          WHERE d.status='replaying' AND d.failure_side='consumer'
            AND d.notification_delivery_id IS NULL
          ORDER BY d.tenant_id,d.park_id`
      ) as Array<{ tenant_id: string; park_id: string }>;
      const authorizedScopes: TenantParkScope[] = [];
      for (const row of scopeRows) {
        const scope = { tenantId: row.tenant_id, parkId: row.park_id };
        if (await input.authorize(manager, scope)) authorizedScopes.push(scope);
      }
      if (!authorizedScopes.length) return [];
      const rows = mutationRows(await manager.query(
      `SELECT o.*,d.id AS replay_dlq_id,d.version AS replay_dlq_version
       FROM biz_property_event_dlq d
       JOIN biz_property_outbox o ON o.tenant_id=d.tenant_id
        AND o.park_id=d.park_id AND o.event_id=d.original_event_id
       WHERE d.status='replaying' AND d.failure_side='consumer'
         AND d.notification_delivery_id IS NULL
         AND EXISTS (
           SELECT 1 FROM jsonb_to_recordset($2::jsonb)
             AS authorized(tenant_id text,park_id text)
            WHERE authorized.tenant_id=d.tenant_id::text
              AND authorized.park_id=d.park_id::text
         )
       ORDER BY d.last_replay_at,d.id LIMIT $1`,
      [
        input.limit,
        JSON.stringify(authorizedScopes.map((scope) => ({
          tenant_id: scope.tenantId, park_id: scope.parkId
        })))
      ]
      ));
      return rows.map((row) => ({
        ...this.mapEnvelope({
        ...row, claim_epoch: row.claim_epoch ?? 0, claim_token: row.claim_token ?? randomUUID()
        }),
        replayDlqId: string(row.replay_dlq_id),
        replayDlqVersion: number(row.replay_dlq_version)
      }));
    });
  }

  async completeConsumerReplay(
    manager: EntityManager,
    input: {
      dlqId: string;
      eventId: string;
      consumerName: string;
      expectedDlqVersion: number;
      inboxResultHash: string;
    }
  ): Promise<boolean> {
    const terminalHash = createHash("sha256").update(JSON.stringify({
      dlqId: input.dlqId, eventId: input.eventId,
      consumerName: input.consumerName, inboxResultHash: input.inboxResultHash,
      status: "resolved", version: input.expectedDlqVersion + 1
    })).digest("hex");
    const rows = mutationRows(await manager.query(
      `WITH eligible AS (
         SELECT d.tenant_id,d.park_id,d.id,d.original_event_id,d.payload_hash,
           source.operator_id,source.incident_id,source.reason
         FROM biz_property_event_dlq d
         JOIN LATERAL (
           SELECT operator_id,incident_id,reason
           FROM biz_property_event_replay_audit
           WHERE tenant_id=d.tenant_id AND park_id=d.park_id
             AND dlq_id=d.id AND after_status='replaying'
           ORDER BY created_at DESC,id DESC LIMIT 1
         ) source ON true
         WHERE d.id=$1 AND d.original_event_id=$2
           AND d.consumer_name=$3 AND d.failure_side='consumer'
           AND d.notification_delivery_id IS NULL
           AND d.status='replaying' AND d.version=$4
           AND EXISTS (
             SELECT 1 FROM biz_property_inbox receipt
             WHERE receipt.tenant_id=d.tenant_id AND receipt.park_id=d.park_id
               AND receipt.consumer_name=d.consumer_name
               AND receipt.event_id=d.original_event_id
               AND receipt.result_hash=$5
           )
         FOR UPDATE OF d
       ), resolved AS (
         UPDATE biz_property_event_dlq d
         SET status='resolved',version=d.version+1
         FROM eligible
         WHERE d.tenant_id=eligible.tenant_id AND d.park_id=eligible.park_id
           AND d.id=eligible.id
         RETURNING d.tenant_id,d.park_id,d.id,d.original_event_id,d.payload_hash,
           eligible.operator_id,eligible.incident_id,eligible.reason
       )
       INSERT INTO biz_property_event_replay_audit(
         tenant_id,park_id,dlq_id,original_event_id,operator_id,incident_id,reason,
         before_status,after_status,payload_hash,result_hash
       )
       SELECT tenant_id,park_id,id,original_event_id,operator_id,incident_id,reason,
         'replaying','resolved',payload_hash,$6
       FROM resolved
       RETURNING id`,
      [
        input.dlqId, input.eventId, input.consumerName,
        input.expectedDlqVersion, input.inboxResultHash, terminalHash
      ]
    ));
    return rows.length === 1;
  }

  private async quarantineChecksumMismatch(
    manager: EntityManager,
    input: InboxConsumeInput,
    canonicalPayloadHash: string
  ): Promise<void> {
    await manager.query(
      `INSERT INTO biz_property_event_dlq(
        tenant_id,park_id,original_event_id,consumer_name,payload_hash,failure_side,
        error_category,error_code,attempt_count,first_failed_at,last_failed_at,status
      ) VALUES($1,$2,$3,$4,$5,'consumer','integrity','event-checksum-mismatch',1,
        clock_timestamp(),clock_timestamp(),'quarantined')
      ON CONFLICT (tenant_id,park_id,original_event_id,consumer_name,failure_side)
      DO UPDATE SET status='quarantined',error_category='integrity',
        error_code='event-checksum-mismatch',last_failed_at=clock_timestamp(),
        attempt_count=biz_property_event_dlq.attempt_count+1,
        version=biz_property_event_dlq.version+1`,
      [
        input.scope.tenantId, input.scope.parkId, input.event.eventId,
        input.consumerName, canonicalPayloadHash
      ]
    );
  }

  async listApprovalIncidents(
    scope: TenantParkScope,
    assignedRequestIds: readonly string[],
    query: ApprovalIncidentListQuery
  ): Promise<PropertyPaginatedResult<ApprovalIncidentListItem, never>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const filters = [
      "r.tenant_id=$1", "r.park_id=$2", "r.execution_status='infra_exhausted'"
    ];
    const params: unknown[] = [scope.tenantId, scope.parkId, assignedRequestIds];
    filters.push("r.id=ANY($3::uuid[])");
    if (query.actionId) {
      params.push(query.actionId); filters.push(`r.action_id=$${params.length}`);
    }
    if (query.sourceType) {
      params.push(query.sourceType); filters.push(`r.source_type=$${params.length}`);
    }
    const where = filters.join(" AND ");
    const countRows = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM biz_property_approval_request r WHERE ${where}`,
      params
    ) as Row[];
    const sortMap = {
      infraExhaustedAt: "r.infra_exhausted_at",
      lastRetryAt: "last_retry_at",
      updatedAt: "r.updated_at"
    } as const;
    const sort = sortMap[query.sort ?? "infraExhaustedAt"];
    const order = query.order === "asc" ? "ASC" : "DESC";
    const rows = await this.dataSource.query(
      `SELECT r.*,COALESCE(u.display_name,'已注销用户') AS requester_display_name,
        (SELECT max(a.occurred_at) FROM biz_property_approval_audit a
         WHERE a.tenant_id=r.tenant_id AND a.park_id=r.park_id
           AND a.request_id=r.id AND a.action_id IN (
             'property.approval.execution.retry-authorized',
             'property.approval.incident-retry'
           )) AS last_retry_at
       FROM biz_property_approval_request r
       LEFT JOIN sys_user u ON u.tenant_id=r.tenant_id AND u.park_id=r.park_id
         AND u.id=r.requester_id
       WHERE ${where}
       ORDER BY ${sort} ${order} NULLS LAST,r.id ${order}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    ) as Row[];
    return {
      items: rows.map(this.mapApprovalIncident),
      page, pageSize, total: number(countRows[0]?.total ?? 0), allowedActions: []
    };
  }

  async getApprovalIncident(
    scope: TenantParkScope, requestId: string
  ): Promise<ApprovalIncidentDetail | null> {
    const rows = await this.dataSource.query(
      `SELECT r.*,COALESCE(u.display_name,'已注销用户') AS requester_display_name,
        (SELECT max(a.occurred_at) FROM biz_property_approval_audit a
         WHERE a.tenant_id=r.tenant_id AND a.park_id=r.park_id
           AND a.request_id=r.id AND a.action_id IN (
             'property.approval.execution.retry-authorized',
             'property.approval.incident-retry'
           )) AS last_retry_at
       FROM biz_property_approval_request r
       LEFT JOIN sys_user u ON u.tenant_id=r.tenant_id AND u.park_id=r.park_id
         AND u.id=r.requester_id
       WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.id=$3
         AND r.execution_status='infra_exhausted'`,
      [scope.tenantId, scope.parkId, requestId]
    ) as Row[];
    if (!rows.length) return null;
    const timeline = await this.dataSource.query(
      `SELECT action_id AS "actionId",from_execution_status AS "fromExecutionStatus",
              to_execution_status AS "toExecutionStatus",incident_id AS "incidentId",
              occurred_at AS "occurredAt"
       FROM biz_property_approval_audit
       WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3
       ORDER BY occurred_at,id`,
      [scope.tenantId, scope.parkId, requestId]
    ) as Row[];
    return {
      ...this.mapApprovalIncident(rows[0]!),
      safeReconcileSummary: { state: "not-run" },
      auditTimeline: timeline.map((entry) => ({
        ...entry, occurredAt: iso(entry.occurredAt)
      }))
    };
  }

  private readonly mapEnvelope = (row: Row): PropertyEventEnvelope => ({
    eventId: string(row.event_id), tenantId: string(row.tenant_id), parkId: string(row.park_id),
    eventType: string(row.event_type), eventVersion: number(row.event_version),
    orderingKey: string(row.ordering_key), sequence: string(row.sequence),
    eventOrdinal: number(row.event_ordinal), payload: row.payload as Record<string, unknown>,
    payloadHash: string(row.payload_hash), claimEpoch: string(row.claim_epoch),
    attemptCount: number(row.attempt_count),
    claimToken: string(row.claim_token)
  });

  private readonly mapEventIncident = (row: Row): IncidentListItem => ({
    dlqId: string(row.id), eventId: string(row.original_event_id),
    notificationDeliveryId: row.notification_delivery_id == null
      ? null : string(row.notification_delivery_id),
    failureSide: string(row.failure_side), consumerName: string(row.consumer_name),
    status: string(row.status), version: number(row.version), attemptCount: number(row.attempt_count),
    firstFailedAt: iso(row.first_failed_at), lastFailedAt: iso(row.last_failed_at),
    errorCategory: string(row.error_category), errorCode: string(row.error_code),
    incidentId: row.incident_id == null ? string(row.id) : string(row.incident_id),
    lastReplayAt: nullableIso(row.last_replay_at),
    deepLink: `/property/event-delivery-incidents/${string(row.id)}`,
    allowedActions: []
  });

  private readonly mapApprovalIncident = (row: Row): ApprovalIncidentListItem => ({
    requestId: string(row.id), incidentId: string(row.id),
    actionId: string(row.action_id) as TrackBApprovalActionId,
    sourceType: string(row.source_type), sourceId: string(row.source_id),
    title: approvalIncidentTitle(string(row.action_id)), executionStatus: "infra_exhausted",
    executionVersion: number(row.execution_version),
    errorCode: string(row.last_error_code ?? "approval-infra-exhausted"),
    infraExhaustedAt: iso(row.infra_exhausted_at), lastRetryAt: nullableIso(row.last_retry_at),
    updatedAt: iso(row.updated_at), requestedBy: string(row.requester_display_name),
    requestedAt: iso(row.submitted_at ?? row.created_at),
    deepLink: `/property/approval-incidents/${string(row.id)}`, allowedActions: []
  });
}

const APPROVAL_INCIDENT_TITLES: Record<string, string> = {
  "homestay.bookings.cancel.request": "民宿订单取消审批执行异常",
  "homestay.finance.refund-or-waive.request": "民宿退款或减免审批执行异常",
  "housing.leases.approve.request": "住房租约审批执行异常",
  "housing.leases.void.request": "住房租约作废审批执行异常",
  "housing.leases.checkout.request": "住房退租审批执行异常",
  "housing.finance.refund-waive-or-deposit-refund.request": "住房退款减免审批执行异常",
  "housing.handovers.complete-move-out-financial.request": "住房交割结算审批执行异常",
  "housing.purchases.lifecycle.request": "住房购买流程审批执行异常",
  "housing.purchases.transfer.request": "住房产权转移审批执行异常",
  "property.mode-transition.request": "房产经营模式切换审批执行异常",
  "property.occupancy.force-release.request": "房产占用强制释放审批执行异常"
};

function mutationRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return Array.isArray(value[0]) ? value[0] as Row[] : value as Row[];
}

function approvalIncidentTitle(actionId: string): string {
  return APPROVAL_INCIDENT_TITLES[actionId] ?? "房产业务审批执行异常";
}
