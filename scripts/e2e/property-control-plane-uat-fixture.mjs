import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const requireFromApi = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { Client } = requireFromApi("pg");

const allowWrite = process.env.ALLOW_PROPERTY_CONTROL_PLANE_UAT_FIXTURE === "yes";
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const runCode = process.env.PROPERTY_CONTROL_PLANE_UAT_CODE ?? "issue-306";
const actorUsername = process.env.ADMIN_USERNAME ?? "admin";

const ids = {
  occupancy: "00000306-0001-4000-8000-000000000001",
  operationConfig: "00000306-0002-4000-8000-000000000001",
  approvalRequest: "00000306-0003-4000-8000-000000000001",
  approvalStage: "00000306-0004-4000-8000-000000000001",
  party: "00000306-0005-4000-8000-000000000001",
  submission: "00000306-0006-4000-8000-000000000001",
  outbox: "00000306-0007-4000-8000-000000000001"
};

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function queryOne(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] ?? null;
}

async function countFixtures(client) {
  const result = await client.query(
    `SELECT
       (SELECT count(*)::int FROM biz_property_occupancy WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid) AS occupancies,
       (SELECT count(*)::int FROM biz_property_approval_request WHERE tenant_id=$1 AND park_id=$2 AND id=$4::uuid) AS mode_requests,
       (SELECT count(*)::int FROM biz_party WHERE tenant_id=$1 AND park_id=$2 AND id=$5::uuid) AS parties,
       (SELECT count(*)::int FROM biz_party_identity_submission WHERE tenant_id=$1 AND park_id=$2 AND id=$6::uuid) AS identity_submissions,
       (SELECT count(*)::int FROM biz_property_outbox WHERE tenant_id=$1 AND park_id=$2 AND event_id=$7::uuid) AS identity_audit_events`,
    [tenantId, parkId, ids.occupancy, ids.approvalRequest, ids.party, ids.submission, ids.outbox]
  );
  return result.rows[0];
}

async function chooseUnit(client) {
  return queryOne(
    client,
    `SELECT unit.id, unit.unit_code, unit.unit_name, config.id AS config_id
       FROM biz_unit unit
       LEFT JOIN biz_property_operation_config config
         ON config.tenant_id=unit.tenant_id AND config.park_id=unit.park_id
        AND config.unit_id=unit.id AND config.is_deleted=false
      WHERE unit.tenant_id=$1 AND unit.park_id=$2 AND unit.is_deleted=false
      ORDER BY CASE WHEN config.id IS NULL THEN 0 ELSE 1 END, unit.create_time, unit.id
      LIMIT 1`,
    [tenantId, parkId]
  );
}

async function applyFixtures(client) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to write property control-plane UAT fixtures in production.");
  }
  if (!allowWrite) {
    throw new Error("Set ALLOW_PROPERTY_CONTROL_PLANE_UAT_FIXTURE=yes to write UAT fixtures.");
  }

  const actor = await queryOne(
    client,
    `SELECT id FROM sys_user
      WHERE tenant_id=$1 AND park_id=$2 AND username=$3 AND is_deleted=false
      LIMIT 1`,
    [tenantId, parkId, actorUsername]
  );
  if (!actor?.id) throw new Error(`Cannot find UAT actor ${actorUsername}.`);

  const unit = await chooseUnit(client);
  if (!unit?.id) throw new Error("Cannot find an active biz_unit for property control-plane UAT data.");

  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO biz_property_occupancy(
         id,tenant_id,park_id,unit_id,source_domain,source_type,source_id,
         start_at,end_at,status,hold_expires_at,idempotency_key,create_by,update_by,remark)
       VALUES($1::uuid,$2,$3,$4::uuid,'operations','uat_hold',$5,
         clock_timestamp()-interval '1 hour',clock_timestamp()+interval '2 days','held',
         clock_timestamp()+interval '1 day',$6,$7::uuid,$7::uuid,$8)
       ON CONFLICT (id) DO UPDATE SET
         status='held',
         hold_expires_at=clock_timestamp()+interval '1 day',
         start_at=clock_timestamp()-interval '1 hour',
         end_at=clock_timestamp()+interval '2 days',
         release_reason=NULL,
         released_at=NULL,
         is_deleted=false,
         update_time=clock_timestamp(),
         remark=EXCLUDED.remark`,
      [
        ids.occupancy,
        tenantId,
        parkId,
        unit.id,
        `${runCode}-occupancy`,
        `${runCode}-occupancy`,
        actor.id,
        "Issue #306 UAT: held occupancy for activate action"
      ]
    );

    const configId = unit.config_id ?? ids.operationConfig;
    if (unit.config_id) {
      await client.query(
        `UPDATE biz_property_operation_config
            SET operating_mode='none', operating_status='enabled', is_deleted=false,
                update_time=clock_timestamp(), remark=$4
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid`,
        [tenantId, parkId, configId, "Issue #306 UAT: mode transition source"]
      );
    } else {
      await client.query(
        `INSERT INTO biz_property_operation_config(
           id,tenant_id,park_id,unit_id,operating_mode,operating_status,create_by,update_by,remark)
         VALUES($1::uuid,$2,$3,$4::uuid,'none','enabled',$5::uuid,$5::uuid,$6)`,
        [configId, tenantId, parkId, unit.id, actor.id, "Issue #306 UAT: mode transition source"]
      );
    }

    const canonicalPayload = {
      fromMode: "none",
      targetMode: "short_stay",
      reason: "Issue #306 UAT mode transition",
      actorName: "Issue #306 UAT",
      checkSnapshot: {
        active_occupancy_count: 0,
        incompatible_occupancy_count: 0,
        blocking_reasons: []
      }
    };
    const payloadHash = hashJson(canonicalPayload);
    const policyHash = "d".repeat(64);
    await client.query(
      `INSERT INTO biz_property_approval_request(
         id,tenant_id,park_id,action_id,source_type,source_id,source_expected_version,
         requester_id,submitter_id,client_idempotency_key,business_intent_key,
         canonical_payload,payload_schema_version,payload_hash,policy_id,policy_version,
         policy_hash,decision_status,execution_status,execution_idempotency_key,submitted_at)
       VALUES($1::uuid,$2,$3,'property.mode-transition.request','property-operation-config',$4,1,
         $5::uuid,$5::uuid,$6,$7,$8::jsonb,1,$9,$10::uuid,1,$11,'pending_approval',
         'not_started',$12,clock_timestamp())
       ON CONFLICT (id) DO UPDATE SET
         source_id=EXCLUDED.source_id,
         canonical_payload=EXCLUDED.canonical_payload,
         payload_hash=EXCLUDED.payload_hash,
         decision_status='pending_approval',
         execution_status='not_started',
         updated_at=clock_timestamp()`,
      [
        ids.approvalRequest,
        tenantId,
        parkId,
        configId,
        actor.id,
        `${runCode}-mode-client`,
        `${runCode}-mode-intent`,
        JSON.stringify(canonicalPayload),
        payloadHash,
        randomUUID(),
        policyHash,
        `${runCode}-mode-execution`
      ]
    );

    await client.query(
      `INSERT INTO biz_property_approval_stage(
         id,tenant_id,park_id,request_id,stage_code,stage_ordinal,
         eligibility_policy_snapshot,eligibility_policy_version,eligibility_policy_hash,
         required_count,approved_count,rejected_count,stage_status)
       VALUES($1::uuid,$2,$3,$4::uuid,'uat-review',1,'{}'::jsonb,1,$5,1,0,0,'pending')
       ON CONFLICT (id) DO UPDATE SET stage_status='pending', version=biz_property_approval_stage.version`,
      [ids.approvalStage, tenantId, parkId, ids.approvalRequest, policyHash]
    );

    await client.query(
      `INSERT INTO biz_party(
         id,tenant_id,park_id,party_type,display_name,source_domain,verification_status,
         consent_status,identity_version,create_by,update_by,remark)
       VALUES($1::uuid,$2,$3,'person',$4,'operations','unverified','granted',1,$5::uuid,$5::uuid,$6)
       ON CONFLICT (id) DO UPDATE SET
         display_name=EXCLUDED.display_name,
         verification_status='unverified',
         identity_version=1,
         is_deleted=false,
         update_time=clock_timestamp(),
         remark=EXCLUDED.remark`,
      [
        ids.party,
        tenantId,
        parkId,
        "Issue #306 UAT 身份核验样例",
        actor.id,
        "Issue #306 UAT: identity submission party"
      ]
    );

    await client.query(
      `INSERT INTO biz_party_identity_submission(
         id,tenant_id,park_id,party_id,identity_version,submission_attempt,status,
         drafted_by,recorded_by,drafted_at,source,version)
       VALUES($1::uuid,$2,$3,$4::uuid,1,1,'draft',$5::uuid,$5::uuid,clock_timestamp(),'manual',1)
       ON CONFLICT (id) DO UPDATE SET
         status='draft',
         version=1,
         update_time=clock_timestamp()`,
      [ids.submission, tenantId, parkId, ids.party, actor.id]
    );
    await client.query(
      `UPDATE biz_party
          SET current_identity_submission_id=$4::uuid, update_time=clock_timestamp()
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid`,
      [tenantId, parkId, ids.party, ids.submission]
    );

    const outboxPayload = {
      submissionId: ids.submission,
      partyId: ids.party,
      actorId: actor.id,
      status: "draft",
      submissionVersion: 1,
      assignmentVersion: 0,
      reason: "Issue #306 UAT draft seed",
      documentType: null,
      identityNumberMasked: null,
      fileCount: 0,
      response: null
    };
    const outboxPayloadText = JSON.stringify(outboxPayload);
    await client.query(
      `INSERT INTO biz_property_event_sequence(
         tenant_id,park_id,ordering_key,next_sequence,version)
       VALUES($1,$2,$3,2,1)
       ON CONFLICT (tenant_id,park_id,ordering_key) DO NOTHING`,
      [tenantId, parkId, `party-identity:${ids.party}`]
    );
    await client.query(
      `INSERT INTO biz_property_outbox(
         event_id,tenant_id,park_id,event_type,event_version,aggregate_type,
         aggregate_id,aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash)
       VALUES($1::uuid,$2,$3,'party.identity.draft-created',1,'party_identity_submission',
         $4::uuid,1,$5,1,0,$6::jsonb,$7)
       ON CONFLICT (event_id) DO UPDATE SET
         payload=EXCLUDED.payload,
         payload_hash=EXCLUDED.payload_hash,
         created_at=clock_timestamp()`,
      [
        ids.outbox,
        tenantId,
        parkId,
        ids.submission,
        `party-identity:${ids.party}`,
        outboxPayloadText,
        hashText(outboxPayloadText)
      ]
    );

    await client.query("COMMIT");
    return { actorId: actor.id, unitId: unit.id, unitCode: unit.unit_code, configId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const client = new Client({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DB ?? "jinhu_smart_park",
    user: process.env.POSTGRES_USER ?? "jinhu",
    password: process.env.POSTGRES_PASSWORD ?? "change_me"
  });
  await client.connect();
  try {
    const before = await countFixtures(client);
    console.log(`[INFO] property control-plane UAT fixtures before: ${JSON.stringify(before)}`);
    if (allowWrite) {
      const applied = await applyFixtures(client);
      console.log(`[PASS] property control-plane UAT fixtures applied: ${JSON.stringify(applied)}`);
    } else {
      console.log("[INFO] dry run only; set ALLOW_PROPERTY_CONTROL_PLANE_UAT_FIXTURE=yes to write fixtures");
    }
    const after = await countFixtures(client);
    console.log(`[PASS] property control-plane UAT fixtures after: ${JSON.stringify(after)}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
