import { Injectable } from "@nestjs/common";
import type {
  PropertyApprovalOutboxEvent,
  PropertyApprovalOutboxPort
} from "../property-approval.ports";
import { propertyApprovalError } from "../property-approval.error";
import { hashCanonicalPropertyEvent } from "./property-event-canonical";

type Row = Record<string, unknown>;

@Injectable()
export class PropertyApprovalRuntimeOutboxAdapter implements PropertyApprovalOutboxPort {
  async append(
    manager: import("typeorm").EntityManager,
    input: Parameters<PropertyApprovalOutboxPort["append"]>[1]
  ): Promise<void> {
    if (!input.events.length) return;
    const ordinals = new Set<number>();
    for (const event of input.events) {
      if (
        ordinals.has(event.eventOrdinal)
        || hashCanonicalPropertyEvent(event.payload) !== event.payloadHash
      ) throw propertyApprovalError("approval-reconcile-partial");
      ordinals.add(event.eventOrdinal);
    }

    await manager.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [
        `${input.scope.tenantId}:${input.scope.parkId}:`
        + `approval-outbox:${input.approvalRequestId}`
      ]
    );
    const existing = await manager.query(
      `SELECT event_id,event_type,event_version,aggregate_type,aggregate_id,
              aggregate_version,ordering_key,event_ordinal,payload,payload_hash,
              approval_request_id,execution_idempotency_key
       FROM biz_property_outbox
       WHERE tenant_id=$1 AND park_id=$2 AND approval_request_id=$3
       ORDER BY event_ordinal,event_id
       FOR UPDATE`,
      [input.scope.tenantId, input.scope.parkId, input.approvalRequestId]
    ) as Row[];
    if (existing.length) {
      if (!this.matchesExisting(existing, input.executionIdempotencyKey, input.events)) {
        throw propertyApprovalError("approval-reconcile-partial");
      }
      return;
    }

    const sequences = new Map<string, string>();
    for (const orderingKey of new Set(input.events.map((event) => event.orderingKey))) {
      await manager.query(
        `INSERT INTO biz_property_event_sequence(tenant_id,park_id,ordering_key)
         VALUES($1,$2,$3) ON CONFLICT (tenant_id,park_id,ordering_key) DO NOTHING`,
        [input.scope.tenantId, input.scope.parkId, orderingKey]
      );
      const counters = await manager.query(
        `SELECT next_sequence FROM biz_property_event_sequence
         WHERE tenant_id=$1 AND park_id=$2 AND ordering_key=$3 FOR UPDATE`,
        [input.scope.tenantId, input.scope.parkId, orderingKey]
      ) as Row[];
      if (counters.length !== 1) throw propertyApprovalError("approval-reconcile-partial");
      const sequence = String(counters[0]!.next_sequence);
      const advanced = await manager.query(
        `UPDATE biz_property_event_sequence
         SET next_sequence=next_sequence+1,version=version+1
         WHERE tenant_id=$1 AND park_id=$2 AND ordering_key=$3
           AND next_sequence=$4::bigint
         RETURNING next_sequence`,
        [input.scope.tenantId, input.scope.parkId, orderingKey, sequence]
      );
      if (mutationRows(advanced).length !== 1) {
        throw propertyApprovalError("property-version-conflict");
      }
      sequences.set(orderingKey, sequence);
    }

    for (const event of [...input.events].sort(compareEvents)) {
      await manager.query(
        `INSERT INTO biz_property_outbox(
          event_id,tenant_id,park_id,event_type,event_version,aggregate_type,aggregate_id,
          aggregate_version,ordering_key,sequence,event_ordinal,approval_request_id,
          execution_idempotency_key,payload,payload_hash
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::bigint,$11,$12,$13,$14::jsonb,$15)`,
        [
          event.eventId, input.scope.tenantId, input.scope.parkId,
          event.eventType, event.eventVersion, event.aggregateType, event.aggregateId,
          event.aggregateVersion, event.orderingKey, sequences.get(event.orderingKey),
          event.eventOrdinal, input.approvalRequestId, input.executionIdempotencyKey,
          JSON.stringify(event.payload), event.payloadHash
        ]
      );
    }
  }

  private matchesExisting(
    rows: Row[],
    executionIdempotencyKey: string,
    events: readonly PropertyApprovalOutboxEvent[]
  ): boolean {
    if (rows.length !== events.length) return false;
    const expected = [...events].sort(compareEvents);
    return rows.every((row, index) => {
      const event = expected[index]!;
      return String(row.event_id) === event.eventId
        && String(row.event_type) === event.eventType
        && Number(row.event_version) === event.eventVersion
        && String(row.aggregate_type) === event.aggregateType
        && String(row.aggregate_id) === event.aggregateId
        && Number(row.aggregate_version) === event.aggregateVersion
        && String(row.ordering_key) === event.orderingKey
        && Number(row.event_ordinal) === event.eventOrdinal
        && String(row.execution_idempotency_key) === executionIdempotencyKey
        && String(row.payload_hash) === event.payloadHash
        && hashCanonicalPropertyEvent(row.payload) === event.payloadHash;
    });
  }
}

function compareEvents(left: PropertyApprovalOutboxEvent, right: PropertyApprovalOutboxEvent) {
  return left.eventOrdinal - right.eventOrdinal || left.eventId.localeCompare(right.eventId);
}

function mutationRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return Array.isArray(value[0]) ? value[0] as Row[] : value as Row[];
}
