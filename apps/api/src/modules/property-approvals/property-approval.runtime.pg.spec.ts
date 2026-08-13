import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TRACK_B_CONTRACT_SHA256 } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import { PropertyApprovalModule } from "./property-approval.module";
import { PropertyApprovalService, canonicalEffectInvariantHash } from
  "./property-approval.service";
import { PropertyApprovalRepository } from "./property-approval.repository";
import {
  PropertyApprovalEffectProofVerifierRegistryService,
  PropertyApprovalEffectRegistry
} from "./property-approval.registries";
import type { PropertyApprovalEffectAdapter } from "./property-approval.ports";
import { hashCanonicalPropertyEvent } from "./outbox/property-event-canonical";

const url = process.env.PROPERTY_RUNTIME_PG_URL;
const suite = url ? describe : describe.skip;

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres", url: url!, autoLoadEntities: true, synchronize: false,
      migrationsRun: false, logging: false
    }),
    PropertyApprovalModule
  ]
})
class PropertyApprovalPgRootModule {}

type Fault = "none" | "adapter-lie" | "outbox" | "missing-row" | "duplicate-row"
  | "verifier-lie";

suite("property approval core PostgreSQL atomic gate", () => {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  let dataSource: DataSource;
  let service: PropertyApprovalService;
  let repository: PropertyApprovalRepository;
  let tenantId: string;
  let parkId: string;
  let buildingId: string;
  let floorId: string;
  let registerProofVerifier: () => void;

  before(async () => {
    app = await NestFactory.createApplicationContext(PropertyApprovalPgRootModule, {
      logger: false
    });
    dataSource = app.get(DataSource);
    service = app.get(PropertyApprovalService);
    repository = app.get(PropertyApprovalRepository);
    tenantId = randomUUID();
    parkId = randomUUID();
    buildingId = randomUUID();
    floorId = randomUUID();
    await dataSource.query(
      `INSERT INTO biz_park(tenant_id,park_id,park_code,park_name)
       VALUES($1,$2,$3,'Approval PG park')`,
      [tenantId, parkId, `AP-P-${buildingId}`]
    );
    await dataSource.query(
      `INSERT INTO biz_building(id,tenant_id,park_id,building_code,building_name)
       VALUES($1,$2,$3,$4,'Approval PG building')`,
      [buildingId, tenantId, parkId, `AP-${buildingId}`]
    );
    await dataSource.query(
      `INSERT INTO biz_floor(id,tenant_id,park_id,building_id,floor_code,floor_no,floor_name)
       VALUES($1,$2,$3,$4,$5,1,'Approval PG floor')`,
      [floorId, tenantId, parkId, buildingId, `AP-${floorId}`]
    );
    await dataSource.query(
      `INSERT INTO sys_property_runtime_control(
        tenant_id,park_id,control_key,control_kind,target,adapter_version,contract_hash,
        enabled,control_mode,enabled_by,enabled_at,approval_reference,disabled_reason
       ) VALUES($1,$2,'approval.enforce','enforce','approval',NULL,$3,
        true,'enforce',$4,clock_timestamp(),'PG-CORE-GATE','')`,
      [tenantId, parkId, TRACK_B_CONTRACT_SHA256, randomUUID()]
    );
    const adapter: PropertyApprovalEffectAdapter = {
      actionId: "property.mode-transition.request",
      execute: async ({ manager, requestId, executionIdempotencyKey, canonicalPayload,
        sourceExpectedVersion }) => {
        const fault = canonicalPayload.fault as Fault;
        const sourceId = String(canonicalPayload.unitId);
        const domainRowId = randomUUID();
        const rowCount = fault === "missing-row" ? 1 : fault === "duplicate-row" ? 3 : 2;
        for (const id of Array.from({ length: rowCount }, (_, index) =>
          index === 0 ? domainRowId : randomUUID())) {
          await manager.query(
            `INSERT INTO biz_property_mode_transition_log(
              id,tenant_id,park_id,unit_id,from_mode,to_mode,reason,operator_id,operator_name
             ) VALUES($1,$2,$3,$4,'none','short_stay',$5,$6,'PG adapter')`,
            [id, tenantId, parkId, sourceId, `pg-gate:${requestId}`, randomUUID()]
          );
        }
        const manifests = await manager.query(
          `SELECT id,effect_kind AS "effectKind",effect_ordinal AS "effectOrdinal",
                  effect_line_key AS "effectLineKey",owning_table AS "owningTable",
                  owning_unique_name AS "owningUniqueName",
                  expected_cardinality AS "expectedCardinality",
                  invariant_hash AS "invariantHash"
             FROM biz_property_execution_effect_manifest
            WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3`,
          [tenantId, parkId, requestId]
        ) as Array<Record<string, unknown>>;
        const manifest = manifests[0]!;
        const payload = {
          approvalRequestId: requestId,
          executionIdempotencyKey,
          actionId: "property.mode-transition.request",
          sourceType: "property-unit",
          sourceId,
          sourceExpectedVersion
        };
        return {
          receipts: [{
            manifestId: String(manifest.id),
            effectKind: String(manifest.effectKind),
            effectOrdinal: Number(manifest.effectOrdinal),
            effectLineKey: String(manifest.effectLineKey),
            domainTable: String(manifest.owningTable),
            domainRowId,
            effectHash: String(manifest.invariantHash),
            owningUniqueName: fault === "adapter-lie"
              ? "uq_wrong_authority" : String(manifest.owningUniqueName),
            uniqueKeyHash: fault === "adapter-lie" ? "f".repeat(64) : createHash("sha256")
              .update(`${requestId}:${sourceId}`).digest("hex"),
            observedCardinality: fault === "adapter-lie"
              ? 99 : Number(manifest.expectedCardinality),
            lineAmount: null,
            currency: null
          }],
          outboxEvents: [{
            eventId: randomUUID(),
            eventType: "property.mode-transition.request.executed",
            eventVersion: 1,
            aggregateType: "property-unit",
            aggregateId: sourceId,
            aggregateVersion: sourceExpectedVersion + 1,
            orderingKey: `property-unit:${sourceId}`,
            eventOrdinal: 0,
            payload,
            payloadHash: fault === "outbox"
              ? "f".repeat(64) : hashCanonicalPropertyEvent(payload)
          }],
          financialMutationCount: 0
        };
      },
      reconcile: async () => ({ state: "absent", financialMutationCount: 0 })
    };
    app.get(PropertyApprovalEffectRegistry).register(adapter);
    registerProofVerifier = () => app.get(
      PropertyApprovalEffectProofVerifierRegistryService
    ).register({
      actionId: "property.mode-transition.request",
      effectKind: "property.mode.transition",
      verify: async ({ manager, requestId, executionIdempotencyKey, effectLineKey,
        owningTable, owningUniqueName }) => {
        const rows = await manager.query(
          `SELECT id FROM biz_property_mode_transition_log
            WHERE tenant_id=$1 AND park_id=$2 AND reason=$3 ORDER BY id`,
          [tenantId, parkId, `pg-gate:${requestId}`]
        ) as Array<{ id: string }>;
        const requestRows = await manager.query(
          `SELECT canonical_payload AS "canonicalPayload"
             FROM biz_property_approval_request
            WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
          [tenantId, parkId, requestId]
        ) as Array<{ canonicalPayload: { fault: Fault } }>;
        if (rows.length !== 2) throw new Error("trusted-proof-row-count-mismatch");
        const fault = requestRows[0]!.canonicalPayload.fault;
        return {
          domainTable: fault === "verifier-lie" ? "biz_wrong_table" : owningTable,
          domainRowId: rows[0]!.id,
          owningUniqueName,
          uniqueKeyHash: createHash("sha256")
            .update(`${requestId}:${executionIdempotencyKey}:${effectLineKey}`).digest("hex"),
          observedCardinality: rows.length,
          lineAmount: null,
          currency: null
        };
      }
    });
  });

  after(async () => { await app?.close(); });

  const insertApproved = async (fault: Fault) => {
    const requestId = randomUUID();
    const manifestId = randomUUID();
    const actorId = randomUUID();
    const sourceId = randomUUID();
    const canonicalPayload = { unitId: sourceId, fault };
    const effect = {
      effectKind: "property.mode.transition",
      effectOrdinal: 0,
      effectLineKey: `unit:${sourceId}`,
      owningTable: "biz_property_mode_transition_log",
      owningUniqueName: "uq_property_mode_transition_approval_line",
      expectedCardinality: 2,
      lineAmount: null,
      currency: null
    };
    await dataSource.query(
      `INSERT INTO biz_unit(
        id,tenant_id,park_id,unit_code,building_id,floor_id,unit_name,usage_type,
        unit_area,rental_status,fitting_status
       ) VALUES($1,$2,$3,$4,$5,$6,'Approval PG unit',1,1,1,1)`,
      [sourceId, tenantId, parkId, `AP-${sourceId}`, buildingId, floorId]
    );
    await dataSource.query(
      `INSERT INTO biz_property_approval_request(
        id,tenant_id,park_id,action_id,source_type,source_id,source_expected_version,
        requester_id,submitter_id,client_idempotency_key,business_intent_key,
        canonical_payload,payload_schema_version,payload_hash,policy_id,policy_version,
        policy_hash,decision_status,execution_status,decision_version,execution_version,
        execution_idempotency_key,decided_at
      ) VALUES($1,$2,$3,'property.mode-transition.request','property-unit',$4,1,
        $5,$5,$6,$7,$8::jsonb,1,$9,$10,1,$11,'approved','not_started',3,1,$12,
        clock_timestamp())`,
      [
        requestId, tenantId, parkId, sourceId, actorId, `client-${requestId}`,
        `intent-${requestId}`, JSON.stringify(canonicalPayload),
        hashCanonicalPropertyEvent(canonicalPayload), randomUUID(), "a".repeat(64),
        `execution-${requestId}`
      ]
    );
    await dataSource.query(
      `INSERT INTO biz_property_execution_effect_manifest(
        id,tenant_id,park_id,request_id,effect_kind,effect_ordinal,effect_line_key,
        owning_table,owning_unique_name,expected_cardinality,line_amount,currency,invariant_hash
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,NULL,$11)`,
      [
        manifestId, tenantId, parkId, requestId, effect.effectKind, effect.effectOrdinal,
        effect.effectLineKey, effect.owningTable, effect.owningUniqueName,
        effect.expectedCardinality,
        canonicalEffectInvariantHash(effect, canonicalPayload)
      ]
    );
    return requestId;
  };

  it("fails closed atomically when the fixed proof verifier is not registered", async () => {
    const requestId = await insertApproved("none");
    const claim = await service.claimExecution({ tenantId, parkId }, requestId, "pg-worker");
    await assert.rejects(service.executeClaim({ tenantId, parkId }, claim));
    const rows = await dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM biz_property_mode_transition_log WHERE reason=$2) AS domain,
        (SELECT count(*)::int FROM biz_property_execution_effect_receipt WHERE request_id=$1) AS receipt,
        (SELECT count(*)::int FROM biz_property_approval_audit
          WHERE request_id=$1 AND to_execution_status='executed') AS executed,
        (SELECT count(*)::int FROM biz_property_outbox WHERE approval_request_id=$1) AS outbox`,
      [requestId, `pg-gate:${requestId}`]
    ) as Array<{ domain: number; receipt: number; executed: number; outbox: number }>;
    assert.deepEqual(rows[0], { domain: 0, receipt: 0, executed: 0, outbox: 0 });
    registerProofVerifier();
  });

  it("commits domain rows, three-proof receipt, executed audit and outbox atomically", async () => {
    const requestId = await insertApproved("none");
    const claim = await service.claimExecution({ tenantId, parkId }, requestId, "pg-worker");
    const result = await service.executeClaim({ tenantId, parkId }, claim);
    assert.equal(result.executionStatus, "executed");
    const rows = await dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM biz_property_mode_transition_log WHERE reason=$2) AS domain,
        (SELECT count(*)::int FROM biz_property_execution_effect_receipt
          WHERE request_id=$1 AND owning_unique_name IS NOT NULL
            AND unique_key_hash IS NOT NULL AND observed_cardinality=2) AS receipt,
        (SELECT count(*)::int FROM biz_property_approval_audit
          WHERE request_id=$1 AND to_execution_status='executed') AS audit,
        (SELECT count(*)::int FROM biz_property_outbox WHERE approval_request_id=$1) AS outbox`,
      [requestId, `pg-gate:${requestId}`]
    ) as Array<{ domain: number; receipt: number; audit: number; outbox: number }>;
    assert.deepEqual(rows[0], { domain: 2, receipt: 1, audit: 1, outbox: 1 });
  });

  it("ignores adapter-reported receipt lies and persists only trusted verifier proof", async () => {
    const requestId = await insertApproved("adapter-lie");
    const claim = await service.claimExecution({ tenantId, parkId }, requestId, "pg-worker");
    assert.equal(
      (await service.executeClaim({ tenantId, parkId }, claim)).executionStatus,
      "executed"
    );
    const rows = await dataSource.query(
      `SELECT owning_unique_name AS "owningUniqueName",observed_cardinality AS "cardinality"
         FROM biz_property_execution_effect_receipt WHERE request_id=$1`,
      [requestId]
    ) as Array<{ owningUniqueName: string; cardinality: number }>;
    assert.deepEqual(rows, [{
      owningUniqueName: "uq_property_mode_transition_approval_line", cardinality: 2
    }]);
  });

  it("rolls back domain, receipt, executed audit and outbox on proof failures", async () => {
    for (const fault of ["verifier-lie", "missing-row", "duplicate-row", "outbox"] as const) {
      const requestId = await insertApproved(fault);
      const claim = await service.claimExecution({ tenantId, parkId }, requestId, "pg-worker");
      await assert.rejects(service.executeClaim({ tenantId, parkId }, claim));
      const rows = await dataSource.query(
        `SELECT
          (SELECT count(*)::int FROM biz_property_mode_transition_log WHERE reason=$2) AS domain,
          (SELECT count(*)::int FROM biz_property_execution_effect_receipt
            WHERE request_id=$1) AS receipt,
          (SELECT count(*)::int FROM biz_property_approval_audit
            WHERE request_id=$1 AND to_execution_status='executed') AS audit,
          (SELECT count(*)::int FROM biz_property_outbox WHERE approval_request_id=$1) AS outbox`,
        [requestId, `pg-gate:${requestId}`]
      ) as Array<{ domain: number; receipt: number; audit: number; outbox: number }>;
      assert.deepEqual(rows[0], { domain: 0, receipt: 0, audit: 0, outbox: 0 });
    }
  });

  it("rejects the second SQL CAS writer using the stale independent version", async () => {
    const requestId = await insertApproved("none");
    const writer = () => dataSource.transaction((manager: EntityManager) =>
      repository.casExecutionRequest(
        manager, { tenantId, parkId }, requestId, "not_started", 1,
        { executionVersion: 2 }
      ));
    assert.deepEqual((await Promise.all([writer(), writer()])).sort(), [false, true]);
  });
});
