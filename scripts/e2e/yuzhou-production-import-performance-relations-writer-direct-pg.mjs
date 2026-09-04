#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const container = process.env.YUZHOU_PERFORMANCE_PG_CONTAINER ?? "jinhu-smart-park-postgres";
const database = `jinhu_hr_migration_lab_perfrelprod_${process.pid}`;
const h = value => createHash("sha256").update(`synthetic:${value}`).digest("hex");
const operation = "yzprod-import-20260905T010203Z-123456abcdef";
const rollback = "yzprod-rollback-20260905T020304Z-fedcba654321";
const values = {
  plan: h("plan"), auth: h("authorization"), nonce: h("nonce"), rollbackAuth: h("rollback-authorization"), rollbackNonce: h("rollback-nonce"),
  code: "1".repeat(40), source: h("source"), mapping: h("mapping"), target: h("target"), scope: h("scope"), t0: h("t0"),
  relations: h("relations"), identity: h("identity"), migration305: h("migration-305"), migration306: h("migration-306"),
};
const relationHex = Buffer.from("synthetic:relations").toString("hex");
const identityHex = Buffer.from("synthetic:identity").toString("hex");

function psql(target, sql, expectSuccess = true) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", target], { input: sql, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr);
  return result;
}

try {
  psql("postgres", `CREATE DATABASE ${database} TEMPLATE template0;`);
  psql(database, `
    CREATE EXTENSION pgcrypto;
    CREATE TABLE synthetic_operation(
      operation_id text PRIMARY KEY,sealed_plan_sha256 text,authorization_artifact_sha256 text,authorization_nonce_sha256 text,
      code_sha text,source_snapshot_sha256 text,mapping_contract_sha256 text,target_identity_sha256 text,
      tenant_id text,park_id text,scope_sha256 text,t0_phase_receipt_sha256 text,status text
    );
    CREATE TABLE synthetic_authorization_use(operation_id text PRIMARY KEY,artifact_sha256 text UNIQUE,nonce_sha256 text UNIQUE);
    CREATE TABLE synthetic_rollback_authorization_use(rollback_operation_id text PRIMARY KEY,operation_id text,artifact_sha256 text UNIQUE,nonce_sha256 text UNIQUE);
    CREATE TABLE synthetic_relation_receipt(
      operation_id text PRIMARY KEY,relation_payload_sha256 text,identity_payload_sha256 text,migration_305_sha256 text,migration_306_sha256 text,
      status text,receipt_sha256 text,rolled_back boolean NOT NULL DEFAULT false
    );
    CREATE TABLE synthetic_relation_fact(operation_id text,kind text,ordinal integer,PRIMARY KEY(operation_id,kind,ordinal));

    INSERT INTO synthetic_operation VALUES(
      '${operation}','${values.plan}','${values.auth}','${values.nonce}','${values.code}','${values.source}','${values.mapping}','${values.target}',
      'tenant-a','park-a','${values.scope}','${values.t0}','running'
    );
    INSERT INTO synthetic_authorization_use VALUES('${operation}','${values.auth}','${values.nonce}');
    INSERT INTO synthetic_rollback_authorization_use VALUES('${rollback}','${operation}','${values.rollbackAuth}','${values.rollbackNonce}');

    CREATE FUNCTION hr_yuzhou_performance_relations_production_capability_v1()
    RETURNS TABLE(capability_id text,migration_305_sha256 text,migration_306_sha256 text,production_context_supported boolean,reverse_order text)
    LANGUAGE sql STABLE AS $$ SELECT 'jinhu-yuzhou-performance-relations-production-v1','${values.migration305}','${values.migration306}',true,'identity_resolution>source_person_assignments' $$;

    CREATE FUNCTION hr_yuzhou_apply_performance_relations_production_v1(
      p_operation text,p_plan text,p_auth text,p_nonce text,p_code text,p_source text,p_mapping text,p_target text,
      p_tenant text,p_park text,p_scope text,p_t0 text,p_rel_hash text,p_identity_hash text,p_rel bytea,p_identity bytea,p_m305 text,p_m306 text
    ) RETURNS TABLE(status text,replayed boolean,session_rows bigint,score_source_rows bigint,assignment_rows bigint,
      active_relation_maps bigint,identity_resolution_rows bigint,session_binding_rows bigint,subject_unmatched_rows bigint,
      blank_assessor_rows bigint,receipt_sha256 text)
    LANGUAGE plpgsql AS $$
    DECLARE existing synthetic_relation_receipt%ROWTYPE; v_receipt text;
    BEGIN
      IF current_setting('transaction_isolation')<>'serializable' THEN RAISE EXCEPTION 'SYNTHETIC_SERIALIZABLE_REQUIRED'; END IF;
      IF NOT EXISTS(SELECT 1 FROM synthetic_operation o JOIN synthetic_authorization_use a USING(operation_id)
        WHERE o.operation_id=p_operation AND o.sealed_plan_sha256=p_plan AND o.authorization_artifact_sha256=p_auth
          AND o.authorization_nonce_sha256=p_nonce AND a.artifact_sha256=p_auth AND a.nonce_sha256=p_nonce
          AND o.code_sha=p_code AND o.source_snapshot_sha256=p_source AND o.mapping_contract_sha256=p_mapping
          AND o.target_identity_sha256=p_target AND o.tenant_id=p_tenant AND o.park_id=p_park AND o.scope_sha256=p_scope
          AND o.t0_phase_receipt_sha256=p_t0 AND o.status='running') THEN RAISE EXCEPTION 'SYNTHETIC_BINDING_INVALID'; END IF;
      IF encode(digest(p_rel,'sha256'),'hex')<>p_rel_hash OR encode(digest(p_identity,'sha256'),'hex')<>p_identity_hash THEN RAISE EXCEPTION 'SYNTHETIC_ARTIFACT_DRIFT'; END IF;
      SELECT * INTO existing FROM synthetic_relation_receipt WHERE operation_id=p_operation FOR UPDATE;
      IF FOUND THEN
        IF existing.relation_payload_sha256<>p_rel_hash OR existing.identity_payload_sha256<>p_identity_hash
          OR existing.migration_305_sha256<>p_m305 OR existing.migration_306_sha256<>p_m306 OR existing.rolled_back THEN
          RAISE EXCEPTION 'SYNTHETIC_REPLAY_DRIFT';
        END IF;
        RETURN QUERY SELECT 'succeeded',true,7::bigint,0::bigint,117::bigint,124::bigint,234::bigint,7::bigint,108::bigint,117::bigint,existing.receipt_sha256; RETURN;
      END IF;
      INSERT INTO synthetic_relation_fact SELECT p_operation,'relation',n FROM generate_series(1,124)n;
      INSERT INTO synthetic_relation_fact SELECT p_operation,'identity_resolution',n FROM generate_series(1,234)n;
      INSERT INTO synthetic_relation_fact SELECT p_operation,'session_binding',n FROM generate_series(1,7)n;
      v_receipt:=encode(digest(convert_to(p_operation||p_plan||p_rel_hash||p_identity_hash||p_m305||p_m306,'UTF8'),'sha256'),'hex');
      INSERT INTO synthetic_relation_receipt VALUES(p_operation,p_rel_hash,p_identity_hash,p_m305,p_m306,'succeeded',v_receipt,false);
      RETURN QUERY SELECT 'succeeded',false,7::bigint,0::bigint,117::bigint,124::bigint,234::bigint,7::bigint,108::bigint,117::bigint,v_receipt;
    END $$;

    CREATE FUNCTION hr_yuzhou_rollback_performance_relations_production_v1(
      p_rollback text,p_operation text,p_plan text,p_auth text,p_nonce text,p_code text,p_source text,p_mapping text,p_target text,
      p_tenant text,p_park text,p_scope text,p_t0 text,p_m305 text,p_m306 text
    ) RETURNS TABLE(status text,rollback_order text,residual_count bigint,replayed boolean,receipt_sha256 text)
    LANGUAGE plpgsql AS $$
    DECLARE existing synthetic_relation_receipt%ROWTYPE; v_replayed boolean; v_receipt text;
    BEGIN
      IF current_setting('transaction_isolation')<>'serializable' THEN RAISE EXCEPTION 'SYNTHETIC_SERIALIZABLE_REQUIRED'; END IF;
      IF NOT EXISTS(SELECT 1 FROM synthetic_operation o JOIN synthetic_rollback_authorization_use a ON a.operation_id=o.operation_id
        WHERE o.operation_id=p_operation AND o.sealed_plan_sha256=p_plan AND a.rollback_operation_id=p_rollback
          AND a.artifact_sha256=p_auth AND a.nonce_sha256=p_nonce AND o.code_sha=p_code AND o.source_snapshot_sha256=p_source
          AND o.mapping_contract_sha256=p_mapping AND o.target_identity_sha256=p_target AND o.tenant_id=p_tenant
          AND o.park_id=p_park AND o.scope_sha256=p_scope AND o.t0_phase_receipt_sha256=p_t0) THEN RAISE EXCEPTION 'SYNTHETIC_ROLLBACK_BINDING_INVALID'; END IF;
      SELECT * INTO STRICT existing FROM synthetic_relation_receipt WHERE operation_id=p_operation FOR UPDATE;
      IF existing.migration_305_sha256<>p_m305 OR existing.migration_306_sha256<>p_m306 THEN RAISE EXCEPTION 'SYNTHETIC_ROLLBACK_DRIFT'; END IF;
      v_replayed:=existing.rolled_back;
      IF NOT v_replayed THEN
        DELETE FROM synthetic_relation_fact WHERE operation_id=p_operation AND kind IN('identity_resolution','session_binding');
        IF EXISTS(SELECT 1 FROM synthetic_relation_fact WHERE operation_id=p_operation AND kind IN('identity_resolution','session_binding')) THEN RAISE EXCEPTION 'SYNTHETIC_IDENTITY_RESIDUAL'; END IF;
        DELETE FROM synthetic_relation_fact WHERE operation_id=p_operation AND kind='relation';
        UPDATE synthetic_relation_receipt SET rolled_back=true WHERE operation_id=p_operation;
      END IF;
      IF EXISTS(SELECT 1 FROM synthetic_relation_fact WHERE operation_id=p_operation) THEN RAISE EXCEPTION 'SYNTHETIC_RELATION_RESIDUAL'; END IF;
      v_receipt:=encode(digest(convert_to(p_rollback||p_operation||'identity_resolution>source_person_assignments','UTF8'),'sha256'),'hex');
      RETURN QUERY SELECT 'rolled_back','identity_resolution>source_person_assignments',0::bigint,v_replayed,v_receipt;
    END $$;
  `);

  const apply = `SELECT status,replayed,assignment_rows,active_relation_maps,identity_resolution_rows,session_binding_rows
    FROM hr_yuzhou_apply_performance_relations_production_v1('${operation}','${values.plan}','${values.auth}','${values.nonce}',
      '${values.code}','${values.source}','${values.mapping}','${values.target}','tenant-a','park-a','${values.scope}','${values.t0}',
      '${values.relations}','${values.identity}',decode('${relationHex}','hex'),decode('${identityHex}','hex'),'${values.migration305}','${values.migration306}');`;
  const first = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; ${apply} COMMIT;`).stdout.trim();
  assert.equal(first, "succeeded|f|117|124|234|7");
  const replay = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; ${apply} COMMIT;`).stdout.trim();
  assert.equal(replay, "succeeded|t|117|124|234|7");
  const drift = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; ${apply.replace(values.migration306, h("drift"))} COMMIT;`, false);
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /SYNTHETIC_REPLAY_DRIFT/u);
  const rollbackSql = `SELECT status,rollback_order,residual_count,replayed FROM hr_yuzhou_rollback_performance_relations_production_v1(
    '${rollback}','${operation}','${values.plan}','${values.rollbackAuth}','${values.rollbackNonce}','${values.code}','${values.source}',
    '${values.mapping}','${values.target}','tenant-a','park-a','${values.scope}','${values.t0}','${values.migration305}','${values.migration306}');`;
  const reversed = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; ${rollbackSql} COMMIT;`).stdout.trim();
  assert.equal(reversed, "rolled_back|identity_resolution>source_person_assignments|0|f");
  const rollbackReplay = psql(database, `BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE; ${rollbackSql} COMMIT;`).stdout.trim();
  assert.equal(rollbackReplay, "rolled_back|identity_resolution>source_person_assignments|0|t");
  assert.equal(psql(database, `SELECT count(*) FROM synthetic_relation_fact;`).stdout.trim(), "0");
  console.log(JSON.stringify({ status: "PASS", forward: 117, identity: 234, replay: true, driftRejected: true, rollbackOrder: ["identity_resolution", "source_person_assignments"], residualCount: 0, productionWrite: false }));
} finally {
  psql("postgres", `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`, false);
}
