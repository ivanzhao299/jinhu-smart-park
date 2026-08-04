import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource, type EntityManager } from "typeorm";
import type {
  PropertyApprovalEffectAdapter,
  PropertyApprovalVerifiedEffectProof
} from "../property-approvals/property-approval.ports";
import { PropertyFoundationApprovalAdapter } from
  "./property-foundation-approval.adapter";

const databaseUrl = process.env.PROPERTY_FOUNDATION_PG_URL;
const modeAction = "property.mode-transition.request" as const;
const occupancyAction = "property.occupancy.force-release.request" as const;

test("property foundation proof and reconcile require both audit and matching aggregate truth", {
  skip: !databaseUrl,
  timeout: 30_000
}, async () => {
  const dataSource = new DataSource({ type: "postgres", url: databaseUrl });
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const manager = runner.manager;
  const tenantId = randomUUID();
  const parkId = randomUUID();
  const actorId = randomUUID();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const scope = { tenantId, parkId };
  const foundation = new PropertyFoundationApprovalAdapter(
    {} as never, {} as never, {} as never, {} as never, {} as never
  );
  const privateAdapter = foundation as unknown as {
    effectAdapter(actionId: typeof modeAction | typeof occupancyAction):
      PropertyApprovalEffectAdapter;
    verify(
      actionId: typeof modeAction | typeof occupancyAction,
      input: ReturnType<typeof proofInput>
    ): Promise<PropertyApprovalVerifiedEffectProof>;
  };

  try {
    const modeComplete = await createModeFixture(manager, {
      tenantId, parkId, actorId, suffix: `${suffix}-mc`, aggregate: "complete", audit: true
    });
    const modeProof = await privateAdapter.verify(modeAction, proofInput(
      manager, scope, modeComplete.executionKey, modeComplete.lineKey,
      "biz_property_mode_transition_log", "uq_property_mode_transition_approval_line"
    ));
    assert.equal(modeProof.observedCardinality, 2);
    assert.equal((await privateAdapter.effectAdapter(modeAction).reconcile({
      manager, requestId: modeComplete.requestId,
      executionIdempotencyKey: modeComplete.executionKey
    })).state, "complete");

    const occupancyComplete = await createOccupancyFixture(manager, {
      tenantId, parkId, actorId, suffix: `${suffix}-oc`, aggregate: "complete", audit: true
    });
    const occupancyProof = await privateAdapter.verify(occupancyAction, proofInput(
      manager, scope, occupancyComplete.executionKey, occupancyComplete.lineKey,
      "biz_property_occupancy_release_audit",
      "uq_property_occupancy_release_audit_approval_line"
    ));
    assert.equal(occupancyProof.observedCardinality, 2);
    assert.equal((await privateAdapter.effectAdapter(occupancyAction).reconcile({
      manager, requestId: occupancyComplete.requestId,
      executionIdempotencyKey: occupancyComplete.executionKey
    })).state, "complete");

    for (const scenario of ["audit-only", "aggregate-only", "drift"] as const) {
      const mode = await createModeFixture(manager, {
        tenantId, parkId, actorId, suffix: `${suffix}-m-${scenario}`,
        aggregate: scenario === "audit-only" ? "deleted"
          : scenario === "drift" ? "drift" : "complete",
        audit: scenario !== "aggregate-only"
      });
      await assert.rejects(
        privateAdapter.verify(modeAction, proofInput(
          manager, scope, mode.executionKey, mode.lineKey,
          "biz_property_mode_transition_log", "uq_property_mode_transition_approval_line"
        )),
        /property-foundation-effect-proof-mismatch/u,
        `mode ${scenario}`
      );
      const modeReconcile = await privateAdapter.effectAdapter(modeAction).reconcile({
        manager, requestId: mode.requestId, executionIdempotencyKey: mode.executionKey
      });
      assert.equal(
        modeReconcile.state,
        scenario === "aggregate-only" ? "absent" : "partial",
        `mode ${scenario}`
      );

      const occupancy = await createOccupancyFixture(manager, {
        tenantId, parkId, actorId, suffix: `${suffix}-o-${scenario}`,
        aggregate: scenario === "audit-only" ? "deleted"
          : scenario === "drift" ? "drift" : "complete",
        audit: scenario !== "aggregate-only"
      });
      await assert.rejects(
        privateAdapter.verify(occupancyAction, proofInput(
          manager, scope, occupancy.executionKey, occupancy.lineKey,
          "biz_property_occupancy_release_audit",
          "uq_property_occupancy_release_audit_approval_line"
        )),
        /property-foundation-effect-proof-mismatch/u,
        `occupancy ${scenario}`
      );
      const occupancyReconcile = await privateAdapter.effectAdapter(occupancyAction).reconcile({
        manager, requestId: occupancy.requestId,
        executionIdempotencyKey: occupancy.executionKey
      });
      assert.equal(
        occupancyReconcile.state,
        scenario === "aggregate-only" ? "absent" : "partial",
        `occupancy ${scenario}`
      );
    }
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await dataSource.destroy();
  }
});

function proofInput(
  manager: EntityManager,
  scope: { tenantId: string; parkId: string },
  executionIdempotencyKey: string,
  effectLineKey: string,
  owningTable: string,
  owningUniqueName: string
) {
  return {
    manager,
    scope,
    executionIdempotencyKey,
    effectLineKey,
    expectedCardinality: 2,
    owningTable,
    owningUniqueName
  };
}

type AggregateState = "complete" | "deleted" | "drift";
type FixtureInput = {
  tenantId: string;
  parkId: string;
  actorId: string;
  suffix: string;
  aggregate: AggregateState;
  audit: boolean;
};

async function createModeFixture(manager: EntityManager, input: FixtureInput) {
  const ids = await createUnit(manager, input);
  const configId = randomUUID();
  const requestId = randomUUID();
  const executionKey = `foundation-${input.suffix}`;
  const lineKey = `mode-${input.suffix}`;
  const version = input.aggregate === "drift" ? 3 : 2;
  const mode = input.aggregate === "drift" ? "long_rent" : "short_stay";
  await manager.query(
    `INSERT INTO biz_property_operation_config(
       id,tenant_id,park_id,unit_id,operating_mode,operating_status,is_deleted,version)
     VALUES($1,$2,$3,$4,$5,'enabled',$6,$7)`,
    [configId, input.tenantId, input.parkId, ids.unitId, mode,
      input.aggregate === "deleted", version]
  );
  await insertRequest(manager, {
    ...input, requestId, executionKey, actionId: modeAction,
    sourceType: "property-operation-config", sourceId: configId
  });
  if (input.audit) {
    await manager.query(
      `INSERT INTO biz_property_mode_transition_log(
         tenant_id,park_id,unit_id,from_mode,to_mode,reason,check_snapshot,
         operator_id,operator_name,approval_execution_key,approval_effect_kind,
         approval_effect_line_key,approval_effect_hash,source_config_id,source_expected_version)
       VALUES($1,$2,$3,'none','short_stay','approved mode','{}'::jsonb,$4,'PG verifier',
         $5,'property.mode.transition',$6,$7,$8,1)`,
      [input.tenantId, input.parkId, ids.unitId, input.actorId, executionKey,
        lineKey, "a".repeat(64), configId]
    );
  }
  return { requestId, executionKey, lineKey };
}

async function createOccupancyFixture(manager: EntityManager, input: FixtureInput) {
  const ids = await createUnit(manager, input);
  const occupancyId = randomUUID();
  const requestId = randomUUID();
  const executionKey = `foundation-${input.suffix}`;
  const lineKey = `occupancy-${input.suffix}`;
  const version = input.aggregate === "drift" ? 3 : 2;
  const status = input.aggregate === "drift" ? "completed" : "released";
  const sourceId = input.aggregate === "drift" ? `source-drift-${input.suffix}`
    : `source-${input.suffix}`;
  await manager.query(
    `INSERT INTO biz_property_occupancy(
       id,tenant_id,park_id,unit_id,source_domain,source_type,source_id,
       start_at,end_at,status,release_reason,released_at,is_deleted,version)
     VALUES($1,$2,$3,$4,'operations','manual',$5,clock_timestamp()-interval '1 day',
       clock_timestamp()+interval '1 day',$6,'approved release',clock_timestamp(),$7,$8)`,
    [occupancyId, input.tenantId, input.parkId, ids.unitId, sourceId, status,
      input.aggregate === "deleted", version]
  );
  await insertRequest(manager, {
    ...input, requestId, executionKey, actionId: occupancyAction,
    sourceType: "property-occupancy", sourceId: occupancyId
  });
  if (input.audit) {
    await manager.query(
      `INSERT INTO biz_property_occupancy_release_audit(
         tenant_id,park_id,occupancy_id,reason,released_by,released_at,
         source_domain,source_type,source_id,from_status,to_status,
         source_expected_version,resulting_version,approval_execution_key,
         approval_effect_kind,approval_effect_line_key,approval_effect_hash)
       VALUES($1,$2,$3,'approved release',$4,clock_timestamp(),'operations','manual',$5,
         'active','released',1,2,$6,'property.occupancy.force.release',$7,$8)`,
      [input.tenantId, input.parkId, occupancyId, input.actorId,
        `source-${input.suffix}`, executionKey, lineKey, "b".repeat(64)]
    );
  }
  return { requestId, executionKey, lineKey };
}

async function createUnit(manager: EntityManager, input: FixtureInput) {
  const buildingId = randomUUID();
  const floorId = randomUUID();
  const unitId = randomUUID();
  await manager.query(
    `INSERT INTO biz_building(id,tenant_id,park_id,building_code,building_name)
     VALUES($1,$2,$3,$4,'Foundation PG building')`,
    [buildingId, input.tenantId, input.parkId, `B-${input.suffix}`]
  );
  await manager.query(
    `INSERT INTO biz_floor(id,tenant_id,park_id,building_id,floor_code,floor_no,floor_name)
     VALUES($1,$2,$3,$4,$5,1,'Foundation PG floor')`,
    [floorId, input.tenantId, input.parkId, buildingId, `F-${input.suffix}`]
  );
  await manager.query(
    `INSERT INTO biz_unit(id,tenant_id,park_id,unit_code,building_id,floor_id,unit_name,
       usage_type,unit_area,use_area,rental_status,fitting_status)
     VALUES($1,$2,$3,$4,$5,$6,'Foundation PG unit',1,40,40,1,1)`,
    [unitId, input.tenantId, input.parkId, `U-${input.suffix}`, buildingId, floorId]
  );
  return { unitId };
}

async function insertRequest(manager: EntityManager, input: FixtureInput & {
  requestId: string;
  executionKey: string;
  actionId: typeof modeAction | typeof occupancyAction;
  sourceType: string;
  sourceId: string;
}) {
  await manager.query(
    `INSERT INTO biz_property_approval_request(
       id,tenant_id,park_id,action_id,source_type,source_id,source_expected_version,
       requester_id,submitter_id,client_idempotency_key,business_intent_key,
       canonical_payload,payload_schema_version,payload_hash,policy_id,policy_version,
       policy_hash,execution_idempotency_key)
     VALUES($1,$2,$3,$4,$5,$6,1,$7,$7,$8,$9,'{}'::jsonb,1,$10,$11,1,$10,$12)`,
    [input.requestId, input.tenantId, input.parkId, input.actionId, input.sourceType,
      input.sourceId, input.actorId, `client-${input.suffix}`, `intent-${input.suffix}`,
      "c".repeat(64), randomUUID(), input.executionKey]
  );
}
