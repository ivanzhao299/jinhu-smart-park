import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TRACK_B_CONTRACT_SHA256 } from "@jinhu/shared";
import { DataSource } from "typeorm";
import {
  assertPropertyHighRiskActionApprovalRequired
} from "../../shared/property-workbench/property-high-risk-stopship";
import { hashCanonicalPropertyEvent } from "./outbox/property-event-canonical";
import { PropertyApprovalModule } from "./property-approval.module";
import type { PropertyApprovalEffectAdapter } from "./property-approval.ports";
import {
  PropertyApprovalEffectProofVerifierRegistryService,
  PropertyApprovalEffectRegistry
} from "./property-approval.registries";
import {
  canonicalEffectInvariantHash,
  PropertyApprovalService
} from "./property-approval.service";
import { DatabasePropertyRuntimeControlAdapter } from "./property-runtime-control";

const url = process.env.PROPERTY_RUNTIME_PG_URL;
const suite = url ? describe : describe.skip;

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      url: url!,
      autoLoadEntities: true,
      synchronize: false,
      migrationsRun: false,
      logging: false
    }),
    PropertyApprovalModule
  ]
})
class PropertyRuntimeControlRollbackPgRootModule {}

suite("property runtime control PostgreSQL rollback and re-enable drill", () => {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  let dataSource: DataSource;
  let service: PropertyApprovalService;
  let tenantId: string;
  let parkId: string;
  let buildingId: string;
  let floorId: string;
  let identityPartyId: string;
  let identitySnapshotId: string;

  const scope = () => ({ tenantId, parkId });

  before(async () => {
    app = await NestFactory.createApplicationContext(
      PropertyRuntimeControlRollbackPgRootModule,
      { logger: false }
    );
    dataSource = app.get(DataSource);
    service = app.get(PropertyApprovalService);
    tenantId = randomUUID();
    parkId = randomUUID();
    buildingId = randomUUID();
    floorId = randomUUID();
    identityPartyId = randomUUID();
    identitySnapshotId = randomUUID();

    await dataSource.query(
      `INSERT INTO biz_building(id,tenant_id,park_id,building_code,building_name)
       VALUES($1,$2,$3,$4,'Runtime rollback building')`,
      [buildingId, tenantId, parkId, `RC-${buildingId}`]
    );
    await dataSource.query(
      `INSERT INTO biz_floor(id,tenant_id,park_id,building_id,floor_code,floor_no,floor_name)
       VALUES($1,$2,$3,$4,$5,1,'Runtime rollback floor')`,
      [floorId, tenantId, parkId, buildingId, `RC-${floorId}`]
    );
    await dataSource.query(
      `INSERT INTO sys_property_runtime_control(
        tenant_id,park_id,control_key,control_kind,target,adapter_version,contract_hash,
        enabled,control_mode,enabled_by,enabled_at,approval_reference,disabled_reason
       ) VALUES($1,$2,'approval.enforce','enforce','approval',NULL,$3,
        true,'enforce',$4,clock_timestamp(),'PG-ROLLBACK-BASELINE','')`,
      [tenantId, parkId, TRACK_B_CONTRACT_SHA256, randomUUID()]
    );
    await dataSource.query(
      `INSERT INTO biz_party(
        id,tenant_id,park_id,party_type,display_name,identity_document_type,
        identity_number_encrypted,identity_number_hash,identity_number_masked,
        source_domain,verification_status,consent_status
       ) VALUES($1,$2,$3,'person','Runtime retained identity','national_id',
        'pg-encrypted-evidence',$4,'********1234','homestay','verified','granted')`,
      [identityPartyId, tenantId, parkId, createHash("sha256")
        .update(identityPartyId).digest("hex")]
    );
    await dataSource.query(
      `INSERT INTO biz_party_identity_snapshot(
        id,tenant_id,park_id,party_id,identity_version,snapshot_revision,
        document_type,normalized_identity_hash,hash_algorithm,hash_version,
        encrypted_payload,encryption_key_id,payload_format_version,captured_by,
        captured_at,source,confidence
       ) VALUES($1,$2,$3,$4,1,1,'national_id',$5,'sha256',1,
        'pg-encrypted-snapshot','pg-test-key',1,$6,clock_timestamp(),'homestay','high')`,
      [identitySnapshotId, tenantId, parkId, identityPartyId,
        createHash("sha256").update(`snapshot:${identityPartyId}`).digest("hex"),
        randomUUID()]
    );

    const adapter: PropertyApprovalEffectAdapter = {
      actionId: "property.mode-transition.request",
      execute: async ({ manager, requestId, executionIdempotencyKey,
        canonicalPayload, sourceExpectedVersion }) => {
        const sourceId = String(canonicalPayload.unitId);
        const domainRowId = randomUUID();
        for (const id of [domainRowId, randomUUID()]) {
          await manager.query(
            `INSERT INTO biz_property_mode_transition_log(
              id,tenant_id,park_id,unit_id,from_mode,to_mode,reason,
              operator_id,operator_name
             ) VALUES($1,$2,$3,$4,'none','short_stay',$5,$6,'Rollback PG adapter')`,
            [id, tenantId, parkId, sourceId, `flag-drill:${requestId}`, randomUUID()]
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
            owningUniqueName: String(manifest.owningUniqueName),
            uniqueKeyHash: createHash("sha256")
              .update(`${requestId}:${sourceId}`).digest("hex"),
            observedCardinality: Number(manifest.expectedCardinality),
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
            payloadHash: hashCanonicalPropertyEvent(payload)
          }],
          financialMutationCount: 0
        };
      },
      reconcile: async () => ({ state: "absent", financialMutationCount: 0 })
    };
    app.get(PropertyApprovalEffectRegistry).register(adapter);
    app.get(PropertyApprovalEffectProofVerifierRegistryService).register({
      actionId: "property.mode-transition.request",
      effectKind: "property.mode.transition",
      verify: async ({ manager, requestId, executionIdempotencyKey,
        effectLineKey, owningTable, owningUniqueName }) => {
        const rows = await manager.query(
          `SELECT id FROM biz_property_mode_transition_log
            WHERE tenant_id=$1 AND park_id=$2 AND reason=$3 ORDER BY id`,
          [tenantId, parkId, `flag-drill:${requestId}`]
        ) as Array<{ id: string }>;
        if (rows.length !== 2) throw new Error("trusted-proof-row-count-mismatch");
        return {
          domainTable: owningTable,
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

  const insertApproved = async () => {
    const requestId = randomUUID();
    const sourceId = randomUUID();
    const actorId = randomUUID();
    const canonicalPayload = { unitId: sourceId };
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
       ) VALUES($1,$2,$3,$4,$5,$6,'Runtime rollback unit',1,1,1,1)`,
      [sourceId, tenantId, parkId, `RC-${sourceId}`, buildingId, floorId]
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
      [requestId, tenantId, parkId, sourceId, actorId, `client-${requestId}`,
        `intent-${requestId}`, JSON.stringify(canonicalPayload),
        hashCanonicalPropertyEvent(canonicalPayload), randomUUID(), "a".repeat(64),
        `execution-${requestId}`]
    );
    await dataSource.query(
      `INSERT INTO biz_property_execution_effect_manifest(
        id,tenant_id,park_id,request_id,effect_kind,effect_ordinal,effect_line_key,
        owning_table,owning_unique_name,expected_cardinality,line_amount,currency,
        invariant_hash
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,NULL,$11)`,
      [randomUUID(), tenantId, parkId, requestId, effect.effectKind,
        effect.effectOrdinal, effect.effectLineKey, effect.owningTable,
        effect.owningUniqueName, effect.expectedCardinality,
        canonicalEffectInvariantHash(effect, canonicalPayload)]
    );
    return requestId;
  };

  const setEnforcement = async (enabled: boolean) => {
    if (enabled) {
      await dataSource.query(
        `UPDATE sys_property_runtime_control
            SET enabled=true,control_mode='enforce',enabled_by=$3,
                enabled_at=clock_timestamp(),approval_reference='PG-ROLLBACK-REENABLE',
                disabled_reason='',version=version+1
          WHERE tenant_id=$1 AND park_id=$2 AND control_key='approval.enforce'`,
        [tenantId, parkId, randomUUID()]
      );
      return;
    }
    await dataSource.query(
      `UPDATE sys_property_runtime_control
          SET enabled=false,control_mode='disabled',enabled_by=NULL,enabled_at=NULL,
              approval_reference=NULL,disabled_reason='PG rollback drill',version=version+1
        WHERE tenant_id=$1 AND park_id=$2 AND control_key='approval.enforce'`,
      [tenantId, parkId]
    );
  };

  const approvalMode = () => dataSource.transaction((manager) =>
    new DatabasePropertyRuntimeControlAdapter().approvalMode(manager, scope()));

  const retainedEvidence = async (requestId: string) => dataSource.query(
    `SELECT
       (SELECT row_to_json(r) FROM (
          SELECT id,decision_status,execution_status,decision_version,execution_version,
                 payload_hash,execution_idempotency_key
            FROM biz_property_approval_request WHERE id=$1
        ) r) AS request,
       (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM (
          SELECT id,manifest_id,effect_hash,owning_unique_name,unique_key_hash,
                 observed_cardinality
            FROM biz_property_execution_effect_receipt WHERE request_id=$1
        ) r) AS receipts,
       (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb) FROM (
          SELECT id,action_id,from_execution_status,to_execution_status
            FROM biz_property_approval_audit WHERE request_id=$1
        ) a) AS audits,
       (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.event_id),'[]'::jsonb) FROM (
          SELECT event_id,event_type,payload_hash,status
            FROM biz_property_outbox WHERE approval_request_id=$1
        ) o) AS outbox,
       (SELECT row_to_json(p) FROM (
          SELECT id,verification_status,consent_status,version,is_deleted
            FROM biz_party WHERE id=$2
        ) p) AS identity,
       (SELECT row_to_json(s) FROM (
          SELECT id,party_id,identity_version,snapshot_revision,normalized_identity_hash,
                 hash_algorithm,hash_version,encryption_key_id,payload_format_version
            FROM biz_party_identity_snapshot WHERE id=$3
        ) s) AS identity_snapshot,
       (SELECT count(*)::int FROM biz_property_mode_transition_log
          WHERE reason=$4) AS domain_count`,
    [requestId, identityPartyId, identitySnapshotId, `flag-drill:${requestId}`]
  );

  it("fails closed, retains evidence, re-enables approval execution, and keeps stop-ship", async () => {
    assert.equal(await approvalMode(), "enforce");

    const retainedRequestId = await insertApproved();
    const retainedClaim = await service.claimExecution(scope(), retainedRequestId, "pg-before");
    assert.equal((await service.executeClaim(scope(), retainedClaim)).executionStatus, "executed");
    const retainedBeforeRollback = await retainedEvidence(retainedRequestId);
    assert.equal(retainedBeforeRollback[0].domain_count, 2);
    assert.equal(retainedBeforeRollback[0].receipts.length, 1);
    assert.equal(retainedBeforeRollback[0].outbox.length, 1);

    const blockedRequestId = await insertApproved();
    await setEnforcement(false);
    assert.equal(await approvalMode(), "disabled");
    await assert.rejects(
      service.claimExecution(scope(), blockedRequestId, "pg-disabled"),
      /property-runtime-unavailable/
    );
    assert.deepEqual(await retainedEvidence(retainedRequestId), retainedBeforeRollback);
    const blockedEvidence = await retainedEvidence(blockedRequestId);
    assert.equal(blockedEvidence[0].request.execution_status, "not_started");
    assert.equal(blockedEvidence[0].domain_count, 0);
    assert.deepEqual(blockedEvidence[0].receipts, []);
    assert.deepEqual(blockedEvidence[0].audits, []);
    assert.deepEqual(blockedEvidence[0].outbox, []);

    await setEnforcement(true);
    assert.equal(await approvalMode(), "enforce");
    const resumedClaim = await service.claimExecution(scope(), blockedRequestId, "pg-reenabled");
    assert.equal((await service.executeClaim(scope(), resumedClaim)).executionStatus, "executed");
    const resumedEvidence = await retainedEvidence(blockedRequestId);
    assert.equal(resumedEvidence[0].domain_count, 2);
    assert.equal(resumedEvidence[0].receipts.length, 1);
    assert.equal(resumedEvidence[0].outbox.length, 1);
    assert.ok(resumedEvidence[0].audits.some((row: { to_execution_status: string }) =>
      row.to_execution_status === "executed"));

    await setEnforcement(false);
    assert.equal(await approvalMode(), "disabled");
    assert.deepEqual(await retainedEvidence(retainedRequestId), retainedBeforeRollback);
    assert.deepEqual(await retainedEvidence(blockedRequestId), resumedEvidence);
    assert.throws(
      () => assertPropertyHighRiskActionApprovalRequired("homestay.bookings.cancel")
    );
  });
});
