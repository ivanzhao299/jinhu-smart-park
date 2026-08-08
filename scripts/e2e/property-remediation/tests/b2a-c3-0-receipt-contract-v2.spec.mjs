import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const MIGRATION_PATH =
  "database/migrations/000195_property_mutation_receipt_contract_v2.sql";
const LEGACY_MANIFEST_PATH =
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/legacy-action-authority-v1.txt";
const PORT_V2_MANIFEST_PATH =
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/port-v2-action-identity-mode-v1.txt";

const EXPECTED_LEGACY_SHA =
  "4e48a5d5085e09668b4690a582e1d3703feef0b4fadfcf37ddec99177e97f4d9";
const EXPECTED_PORT_V2_SHA =
  "34b48dd58ada4c82a15f6b1b3b997f66873700eb43ac571f253efa039c25a975";

const LEGACY_ACTIONS = [
  "property.approval.submit",
  "property.approval.withdraw",
  "property.approval.decide",
  "property.approval.incident-retry",
  "property.event.replay",
  "property.notification.mark-read",
  "party.identity.create-draft",
  "party.identity.update-draft",
  "party.identity.submit",
  "party.identity.claim",
  "party.identity.reassign",
  "party.identity.verify",
  "party.identity.withdraw"
];

const ITEM_ACTIONS = [
  "property.task.claim",
  "property.task.start",
  "property.task.block",
  "property.task.unblock",
  "property.task.release",
  "property.task.source-terminal.closed",
  "property.task.source-terminal.cancelled"
];
const PORT_V2_ACTIONS = ["property.task.rebuild", ...ITEM_ACTIONS];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readMigration() {
  return readFileSync(MIGRATION_PATH, "utf8");
}

function manifestActions(path) {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t")[1]);
}

function postgresUrl() {
  const url = process.env.PROPERTY_B2A_C3_0_DATABASE_URL;
  if (!url && process.env.PROPERTY_B2A_C3_0_STATIC_ONLY !== "1") {
    assert.fail(
      "PROPERTY_B2A_C3_0_DATABASE_URL is required for the PostgreSQL contract gate; " +
      "set PROPERTY_B2A_C3_0_STATIC_ONLY=1 only for an explicit static preflight"
    );
  }
  return url;
}

function psql(sql) {
  const url = postgresUrl();
  if (!url) return null;
  const result = spawnSync(
    "psql",
    [url, "-X", "--quiet", "--set", "ON_ERROR_STOP=1", "--no-psqlrc", "-At", "-F", "\t", "-c", sql],
    { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 }
  );
  assert.equal(result.signal, null, `psql terminated by ${result.signal}: ${result.stderr}`);
  assert.equal(result.status, 0, `psql failed (${result.status}):\n${result.stderr}\nSQL:\n${sql}`);
  return result.stdout.trimEnd();
}

function dbTest(name, fn) {
  test(name, { concurrency: false }, (context) => {
    if (process.env.PROPERTY_B2A_C3_0_STATIC_ONLY === "1") {
      context.skip("explicit static-only preflight");
      return;
    }
    fn();
  });
}

test("C3-0-001 signed action manifests are exact and hash-bound", () => {
  const legacy = readFileSync(LEGACY_MANIFEST_PATH);
  const portV2 = readFileSync(PORT_V2_MANIFEST_PATH);
  assert.equal(sha256(legacy), EXPECTED_LEGACY_SHA);
  assert.equal(sha256(portV2), EXPECTED_PORT_V2_SHA);
  assert.deepEqual(manifestActions(LEGACY_MANIFEST_PATH), LEGACY_ACTIONS);
  assert.deepEqual(manifestActions(PORT_V2_MANIFEST_PATH), PORT_V2_ACTIONS);
  assert.equal(new Set([...LEGACY_ACTIONS, ...PORT_V2_ACTIONS]).size, 21);
});

test("C3-0-002 000195 is one forward transaction and preserves prior migrations", () => {
  const migration = readMigration();
  assert.match(migration, /^BEGIN;[\s\S]*COMMIT;\s*$/);
  assert.equal((migration.match(/^BEGIN;/gm) ?? []).length, 1);
  assert.equal((migration.match(/^COMMIT;/gm) ?? []).length, 1);
  assert.doesNotMatch(migration, /(?:ALTER|DROP|TRUNCATE)\s+[^;]*sys_schema_migration_history/i);
  assert.doesNotMatch(migration, /(?:UPDATE|DELETE\s+FROM)\s+(?:public\.)?sys_schema_migration_history/i);
  assert.doesNotMatch(migration, /00019[12]_/);
  assert.match(migration, /000194/);
  assert.match(migration, /property-mutation-receipt-000194-(?:drift|preexisting|prerequisite)/i);
  assert.match(migration, /property-mutation-receipt-(?:partial|preexisting).*drift/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fn_property_task_projection_replace_v1/);
});

test("C3-0-003 columns, default, closed checks and signed actions are declared", () => {
  const migration = readMigration();
  for (const column of [
    "receipt_contract_version", "identity_kind", "business_occurrence_key",
    "task_key", "identity_source_type", "result_version"
  ]) assert.match(migration, new RegExp(`\\b${column}\\b`));
  assert.match(migration, /receipt_contract_version\s+varchar\(16\)[\s\S]*DEFAULT\s+'legacy-v1'/i);
  assert.match(migration, /receipt_contract_version[\s\S]*legacy-v1[\s\S]*port-v2/i);
  assert.match(migration, /octet_length\s*\([\s\S]*(?:business_occurrence_key|identity_source_type)/i);
  assert.match(migration, /result_version[\s\S]*2147483647/i);
  assert.match(migration, /task_key[\s\S]*\^\[0-9a-f\]\{64\}\$/i);
  for (const action of [...LEGACY_ACTIONS, ...PORT_V2_ACTIONS]) {
    assert.match(migration, new RegExp(action.replaceAll(".", "\\.")));
  }
});

test("C3-0-004 hash helper, ACL and trigger are fail-closed", () => {
  const migration = readMigration();
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fn_property_mutation_receipt_result_hash_v2/);
  assert.match(migration, /CALLED ON NULL INPUT/i);
  assert.match(migration, /SECURITY INVOKER/i);
  assert.match(migration, /SET search_path\s*=\s*pg_catalog/i);
  assert.match(migration, /public\.digest\s*\(\s*pg_catalog\.convert_to/i);
  assert.match(migration, /property-mutation-result-v1/);
  assert.match(migration, /REVOKE\s+(?:ALL|EXECUTE)[\s\S]*fn_property_mutation_receipt_result_hash_v2[\s\S]*FROM PUBLIC/i);
  assert.match(migration, /GRANT\s+EXECUTE[\s\S]*fn_property_mutation_receipt_result_hash_v2[\s\S]*CURRENT_USER/i);
  assert.equal((migration.match(/CREATE (?:OR REPLACE )?FUNCTION public\.fn_property_mutation_receipt_guard_v2/g) ?? []).length, 1);
  assert.equal((migration.match(/CREATE TRIGGER trg_property_mutation_receipt_guard_v2/g) ?? []).length, 1);
  assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE ON (?:public\.)?biz_property_mutation_receipt/i);
  assert.match(migration, /completed[\s\S]*failed[\s\S]*immutable/i);
  for (const constraint of [
    "ck_biz_property_mutation_receipt_contract_version_v2",
    "ck_biz_property_mutation_receipt_action_version_v2",
    "ck_biz_property_mutation_receipt_identity_v2",
    "ck_biz_property_mutation_receipt_outcome_v2"
  ]) assert.match(migration, new RegExp(constraint));
  assert.match(migration, /property-task-projection-000194-preexisting-definition-drift/);
  assert.match(migration, /property-task-projection-000195-new-definition-drift/);
  assert.match(migration, /property-task-projection-000195-third-state/);
  assert.match(migration, /property-task-projection-writer-acl-drift/);
});

test("C3-0-005 migration declares control all-old/all-new audit and rejects unsafe states", () => {
  const migration = readMigration();
  for (const marker of [
    "all-old", "all-new", "mixed", "enabled", "shadow", "enforce", "audit",
    "scope-exact-set", "contract-drift"
  ]) assert.match(migration, new RegExp(marker, "i"));
  assert.match(migration, /b2a-contract-correction-000195/);
  assert.match(migration, /UPDATE public\.sys_property_runtime_control/i);
  assert.match(migration, /INSERT INTO public\.sys_property_runtime_control_contract_audit/i);
  assert.match(migration, /v_old[\s\S]*v_new[\s\S]*v_audit/i);
});

dbTest("C3-0-006 catalog, defaults, checks, helper definition, ACL and trigger are exact", () => {
  const output = psql(String.raw`
WITH expected(name,data_type,nullable,default_fragment) AS (VALUES
 ('receipt_contract_version','character varying','NO','legacy-v1'),
 ('identity_kind','character varying','YES',NULL),
 ('business_occurrence_key','character varying','YES',NULL),
 ('task_key','character','YES',NULL),
 ('identity_source_type','character varying','YES',NULL),
 ('result_version','integer','YES',NULL)
), actual AS (
 SELECT column_name,data_type,is_nullable,column_default
 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='biz_property_mutation_receipt'
   AND column_name IN (SELECT name FROM expected)
)
SELECT count(*),
 count(*) FILTER (WHERE a.column_name=e.name AND a.data_type=e.data_type
   AND a.is_nullable=e.nullable
   AND (e.default_fragment IS NULL AND a.column_default IS NULL
        OR e.default_fragment IS NOT NULL AND a.column_default LIKE '%'||e.default_fragment||'%'))
FROM expected e LEFT JOIN actual a ON a.column_name=e.name;
SELECT count(*) FROM pg_constraint c
JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
WHERE n.nspname='public' AND r.relname='biz_property_mutation_receipt'
  AND c.contype='c' AND c.convalidated;
SELECT p.prosecdef,p.provolatile,p.proisstrict,coalesce(array_to_string(p.proconfig,','),'')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_property_mutation_receipt_result_hash_v2';
SELECT has_function_privilege('public',p.oid,'EXECUTE')
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
 'fn_property_mutation_receipt_result_hash_v2','fn_property_mutation_receipt_guard_v2')
ORDER BY p.proname;
SELECT count(*),bool_and(t.tgenabled='O')
FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
WHERE n.nspname='public' AND r.relname='biz_property_mutation_receipt'
 AND t.tgname='trg_property_mutation_receipt_guard_v2' AND NOT t.tgisinternal;
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_property_task_projection_replace_v1';
SELECT count(*),count(*) FILTER (WHERE c.convalidated)
FROM pg_constraint c WHERE c.conrelid='public.biz_property_mutation_receipt'::regclass
 AND c.conname IN ('ck_biz_property_mutation_receipt_contract_version_v2',
  'ck_biz_property_mutation_receipt_action_version_v2',
  'ck_biz_property_mutation_receipt_identity_v2',
  'ck_biz_property_mutation_receipt_outcome_v2');
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
 'fn_property_mutation_receipt_result_hash_v2','fn_property_mutation_receipt_guard_v2');
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_property_mutation_receipt_result_hash_v2'
 AND pg_get_function_identity_arguments(p.oid)=
 'p_action_id character varying, p_target_id uuid, p_identity_kind character varying, p_business_occurrence_key character varying, p_task_key character, p_identity_source_type character varying, p_result_ref character varying, p_result_version integer';
`);
  const lines = output.split("\n");
  assert.equal(lines[0], "6\t6");
  assert.ok(Number(lines[1]) >= 4, `too few validated receipt checks: ${lines[1]}`);
  const [securityDefiner, volatility, strict, config] = lines[2].split("\t");
  assert.equal(securityDefiner, "f");
  assert.equal(volatility, "i");
  assert.equal(strict, "f");
  assert.match(config, /search_path=pg_catalog/);
  assert.deepEqual(lines.slice(3, 5), ["f", "f"]);
  assert.equal(lines[5], "1\tt");
  assert.equal(lines[6], "1");
  assert.equal(lines[7], "4\t4");
  assert.equal(lines[8], "2");
  assert.equal(lines[9], "1");
});

dbTest("C3-0-006b runner-provided pre-195 legacy fingerprints survive byte-for-byte", () => {
  const fingerprintPath = process.env.PROPERTY_B2A_C3_0_PRE_195_FINGERPRINT_PATH;
  assert.ok(fingerprintPath, "runner must provide PROPERTY_B2A_C3_0_PRE_195_FINGERPRINT_PATH");
  const before = JSON.parse(readFileSync(fingerprintPath, "utf8"));
  assert.equal(before.schemaVersion, "b2a-c3-0-pre-195-legacy-fingerprint-v1");
  assert.equal(typeof before.tenantId, "string");
  assert.equal(before.rows?.length, 39);
  const normalize = (rows) => rows.map((row) => ({
    actionId: row.actionId,
    receiptStatus: row.receiptStatus,
    requestHash: row.requestHash,
    resultRef: row.resultRef ?? null,
    resultHash: row.resultHash ?? null
  })).sort((left, right) => {
    const leftKey = `${left.actionId}\t${left.receiptStatus}`;
    const rightKey = `${right.actionId}\t${right.receiptStatus}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const expected = normalize(before.rows);
  assert.deepEqual([...new Set(expected.map((row) => row.actionId))].sort(), [...LEGACY_ACTIONS].sort());
  for (const action of LEGACY_ACTIONS) {
    assert.deepEqual(
      expected.filter((row) => row.actionId === action).map((row) => row.receiptStatus).sort(),
      ["completed", "failed", "started"]
    );
  }
  const tenantLiteral = before.tenantId.replaceAll("'", "''");
  const after = JSON.parse(psql(String.raw`
SELECT coalesce(json_agg(json_build_object(
 'actionId',action_id,'receiptStatus',receipt_status,'requestHash',request_hash::text,
 'resultRef',result_ref,'resultHash',result_hash::text)
 ORDER BY action_id COLLATE "C",receipt_status COLLATE "C"),'[]'::json)::text
FROM public.biz_property_mutation_receipt WHERE tenant_id='${tenantLiteral}';
`));
  assert.deepEqual(normalize(after), expected);
  assert.equal(
    sha256(JSON.stringify(normalize(after)) + "\n"),
    before.canonicalSha256,
    "post-195 legacy fingerprint differs from runner's pre-195 evidence"
  );
});

dbTest("C3-0-007 all 13 legacy actions preserve omission/default and explicit writer bytes", () => {
  const values = LEGACY_ACTIONS.map((action, index) =>
    `(${index + 1},'${action.replaceAll("'", "''")}')`).join(",\n");
  const output = psql(String.raw`
DO $gate$
DECLARE r record; receipt_id uuid; before_hash text; before_ref text;
BEGIN
 FOR r IN SELECT * FROM (VALUES ${values}) AS x(ordinal,action_id) LOOP
   -- Old binaries omit receipt_contract_version. Exercise every historical
   -- lifecycle shape for every signed action, not one representative action.
   INSERT INTO public.biz_property_mutation_receipt(
     tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
   VALUES ('c3-legacy','p1','10000000-0000-0000-0000-000000000001',r.action_id,
     ('21000000-0000-0000-0000-'||lpad(r.ordinal::text,12,'0'))::uuid,
     'old-app-started-'||r.ordinal,repeat('a',64));
   INSERT INTO public.biz_property_mutation_receipt(
     tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
   VALUES ('c3-legacy','p1','10000000-0000-0000-0000-000000000001',r.action_id,
     ('20000000-0000-0000-0000-'||lpad(r.ordinal::text,12,'0'))::uuid,
     'old-app-'||r.ordinal,repeat('a',64)) RETURNING id INTO receipt_id;
   SELECT request_hash::text INTO before_hash FROM public.biz_property_mutation_receipt WHERE id=receipt_id;
   UPDATE public.biz_property_mutation_receipt SET receipt_status='completed',
     result_ref='legacy/ref/'||r.ordinal,result_hash=repeat('b',64),completed_at=clock_timestamp()
   WHERE id=receipt_id;
   SELECT result_ref INTO before_ref FROM public.biz_property_mutation_receipt WHERE id=receipt_id;
   IF before_hash<>repeat('a',64) OR before_ref<>'legacy/ref/'||r.ordinal OR EXISTS(
     SELECT 1 FROM public.biz_property_mutation_receipt WHERE id=receipt_id
      AND (receipt_contract_version<>'legacy-v1' OR identity_kind IS NOT NULL
       OR business_occurrence_key IS NOT NULL OR task_key IS NOT NULL
       OR identity_source_type IS NOT NULL OR result_version IS NOT NULL
       OR result_hash::text<>repeat('b',64))) THEN
     RAISE EXCEPTION 'legacy-old-app-byte-drift:%',r.action_id;
   END IF;
   INSERT INTO public.biz_property_mutation_receipt(
     tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash)
   VALUES ('c3-legacy','p1','10000000-0000-0000-0000-000000000001',r.action_id,
     ('22000000-0000-0000-0000-'||lpad(r.ordinal::text,12,'0'))::uuid,
     'old-app-failed-'||r.ordinal,repeat('a',64)) RETURNING id INTO receipt_id;
   UPDATE public.biz_property_mutation_receipt SET receipt_status='failed',
     result_ref='legacy/failure/'||r.ordinal,result_hash=repeat('c',64)
   WHERE id=receipt_id;
   IF EXISTS(SELECT 1 FROM public.biz_property_mutation_receipt WHERE id=receipt_id
     AND (receipt_contract_version<>'legacy-v1' OR receipt_status<>'failed'
       OR request_hash::text<>repeat('a',64) OR result_hash::text<>repeat('c',64)
       OR result_ref<>'legacy/failure/'||r.ordinal OR completed_at IS NOT NULL
       OR identity_kind IS NOT NULL OR business_occurrence_key IS NOT NULL
       OR task_key IS NOT NULL OR identity_source_type IS NOT NULL OR result_version IS NOT NULL)) THEN
     RAISE EXCEPTION 'legacy-failed-byte-drift:%',r.action_id;
   END IF;
   INSERT INTO public.biz_property_mutation_receipt(
     tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash,
     receipt_contract_version)
   VALUES ('c3-legacy','p1','10000000-0000-0000-0000-000000000001',r.action_id,
     ('23000000-0000-0000-0000-'||lpad(r.ordinal::text,12,'0'))::uuid,
     'new-explicit-'||r.ordinal,repeat('d',64),'legacy-v1');
 END LOOP;
END $gate$;
SELECT count(*),count(*) FILTER (WHERE receipt_contract_version='legacy-v1')
FROM public.biz_property_mutation_receipt WHERE tenant_id='c3-legacy';
`);
  assert.equal(output, "52\t52");
});

dbTest("C3-0-008 all 8 port-v2 action/identity/ref/hash branches accept only canonical bytes", () => {
  const output = psql(String.raw`
DO $gate$
DECLARE action text; target uuid; receipt_id uuid; occurrence text; task_key text:=repeat('b',64);
        source_type text:='fixture_source'; ref text; identity_tag text; v_result_hash text;
BEGIN
 FOREACH action IN ARRAY ARRAY[${PORT_V2_ACTIONS.map((a) => `'${a}'`).join(",")}] LOOP
   target:=uuid_generate_v4();
   IF action='property.task.rebuild' THEN
     occurrence:=NULL;
     ref:='property-task-rebuild/'||source_type||'/'||lower(target::text)||'/v1';
     identity_tag:='property-task-source-rebuild:'||octet_length(convert_to(source_type,'UTF8'))
       ||':'||source_type||':'||lower(target::text);
     SELECT encode(public.digest(pg_catalog.convert_to('property-mutation-result-v1'||E'\n'
       ||action||E'\t'||lower(target::text)||E'\t'||identity_tag||E'\t'||ref||E'\t1\n','UTF8'),'sha256'),'hex')
       INTO v_result_hash;
     INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
       client_key,request_hash,receipt_contract_version,identity_kind,identity_source_type)
     VALUES ('c3-v2','p1','10000000-0000-0000-0000-000000000002',action,target,
       action||'-key',repeat('d',64),'port-v2','property-task-source-rebuild',source_type)
     RETURNING id INTO receipt_id;
   ELSE
     occurrence:='occ-'||action;
     IF action LIKE 'property.task.source-terminal.%' THEN
       ref:='property-task-source-terminal/'||source_type||'/'||lower(target::text)||'/'
         ||split_part(action,'.',4)||'/v1';
     ELSE
       ref:='property-task/'||lower(target::text)||'/v1';
     END IF;
     identity_tag:='property-task:'||task_key||':'
       ||octet_length(convert_to(occurrence,'UTF8'))||':'||occurrence;
     SELECT encode(public.digest(pg_catalog.convert_to('property-mutation-result-v1'||E'\n'
       ||action||E'\t'||lower(target::text)||E'\t'||identity_tag||E'\t'||ref||E'\t1\n','UTF8'),'sha256'),'hex')
       INTO v_result_hash;
     INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
       client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
     VALUES ('c3-v2','p1','10000000-0000-0000-0000-000000000002',action,target,
       action||'-key',repeat('d',64),'port-v2','property-task',occurrence,task_key)
     RETURNING id INTO receipt_id;
   END IF;
   UPDATE public.biz_property_mutation_receipt SET receipt_status='completed',result_ref=ref,
     result_version=1,result_hash=v_result_hash,completed_at=clock_timestamp() WHERE id=receipt_id;
 END LOOP;
END $gate$;
SELECT count(*),count(*) FILTER (WHERE receipt_status='completed' AND result_version=1)
FROM public.biz_property_mutation_receipt WHERE tenant_id='c3-v2';
`);
  assert.equal(output, "8\t8");
});

dbTest("C3-0-009 Unicode byte limits, integer bounds and branch mismatch reject atomically", () => {
  const output = psql(String.raw`
DO $gate$
DECLARE failures integer:=0; target uuid:=uuid_generate_v4();
BEGIN
 -- Each case must fail inside its own subtransaction. Success is a stop-ship.
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'tab',repeat('a',64),
    'port-v2','property-task',E'bad\tkey',repeat('a',64));
   RAISE EXCEPTION 'negative-tab-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'bytes',repeat('a',64),
    'port-v2','property-task',repeat('界',86),repeat('a',64));
   RAISE EXCEPTION 'negative-258-bytes-accepted';
 EXCEPTION WHEN check_violation OR string_data_right_truncation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'legacy-task',repeat('a',64),
    'legacy-v1',NULL,NULL,NULL);
   RAISE EXCEPTION 'task-action-as-legacy-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.approval.submit',target,'legacy-as-v2',repeat('a',64),
    'port-v2','property-task','occ',repeat('a',64));
   RAISE EXCEPTION 'legacy-action-as-v2-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'257-bytes',repeat('a',64),
    'port-v2','property-task',repeat('x',257),repeat('a',64));
   RAISE EXCEPTION 'negative-257-bytes-accepted';
 EXCEPTION WHEN check_violation OR string_data_right_truncation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'spaces',repeat('a',64),
    'port-v2','property-task','   ',repeat('a',64));
   RAISE EXCEPTION 'negative-spaces-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'lf',repeat('a',64),
    'port-v2','property-task',E'bad\nkey',repeat('a',64));
   RAISE EXCEPTION 'negative-lf-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'cr',repeat('a',64),
    'port-v2','property-task',E'bad\rkey',repeat('a',64));
   RAISE EXCEPTION 'negative-cr-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'replacement',repeat('a',64),
    'port-v2','property-task',U&'bad\FFFDkey',repeat('a',64));
   RAISE EXCEPTION 'negative-fffd-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'null-occ',repeat('a',64),
    'port-v2','property-task',NULL,repeat('a',64));
   RAISE EXCEPTION 'negative-null-occurrence-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'null-task',repeat('a',64),
    'port-v2','property-task','occ',NULL);
   RAISE EXCEPTION 'negative-null-task-key-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key,
    identity_source_type)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'item-source',repeat('a',64),
    'port-v2','property-task','occ',repeat('a',64),'fixture_source');
   RAISE EXCEPTION 'negative-item-source-type-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key,
    identity_source_type)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.rebuild',target,'rebuild-item',repeat('a',64),
    'port-v2','property-task-source-rebuild','forbidden',repeat('a',64),'fixture_source');
   RAISE EXCEPTION 'negative-rebuild-forbidden-fields-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,identity_source_type)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.rebuild',target,'bad-source',repeat('a',64),
    'port-v2','property-task-source-rebuild','Bad-Source');
   RAISE EXCEPTION 'negative-source-type-pattern-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'bad-hash',repeat('a',64),
    'port-v2','property-task','occ',repeat('a',64));
   UPDATE public.biz_property_mutation_receipt SET receipt_status='completed',
    result_ref='property-task/'||lower(target::text)||'/v1',result_version=1,
    result_hash=repeat('f',64),completed_at=clock_timestamp()
   WHERE tenant_id='c3-neg' AND client_key='bad-hash';
   RAISE EXCEPTION 'negative-wrong-hash-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
    client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
   VALUES ('c3-neg','p1',uuid_generate_v4(),'property.task.claim',target,'bad-ref',repeat('a',64),
    'port-v2','property-task','occ',repeat('a',64));
   UPDATE public.biz_property_mutation_receipt SET receipt_status='completed',result_ref='wrong',
    result_version=1,result_hash=repeat('f',64),completed_at=clock_timestamp()
   WHERE tenant_id='c3-neg' AND client_key='bad-ref';
   RAISE EXCEPTION 'negative-wrong-ref-accepted';
 EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN
   PERFORM public.fn_property_mutation_receipt_result_hash_v2('property.task.claim',target,
    'property-task','occ',repeat('a',64)::char(64),NULL,
    'property-task/'||lower(target::text)||'/v0',0);
   RAISE EXCEPTION 'negative-result-version-zero-accepted';
 EXCEPTION WHEN invalid_parameter_value THEN failures:=failures+1; END;
 BEGIN
   PERFORM 2147483648::integer;
   RAISE EXCEPTION 'negative-result-version-overflow-accepted';
 EXCEPTION WHEN numeric_value_out_of_range THEN failures:=failures+1; END;
 BEGIN
   PERFORM chr(0);
   RAISE EXCEPTION 'negative-nul-accepted';
 EXCEPTION WHEN SQLSTATE '54000' THEN failures:=failures+1; END;

 -- Accepted byte boundaries and normalization-distinct values remain distinct.
 INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
  client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
 SELECT 'c3-unicode','p1',uuid_generate_v4(),'property.task.claim',uuid_generate_v4(),key,
  repeat('e',64),'port-v2','property-task',occurrence,repeat('e',64)
 FROM (VALUES ('one','x'),('bytes-256',repeat('界',85)||'x'),('nfc',U&'\00E9'),
  ('nfd',U&'e\0301')) AS accepted(key,occurrence);
 IF (SELECT count(*) FROM public.biz_property_mutation_receipt WHERE tenant_id='c3-unicode')<>4
    OR (SELECT count(DISTINCT business_occurrence_key) FROM public.biz_property_mutation_receipt
        WHERE tenant_id='c3-unicode' AND client_key IN ('nfc','nfd'))<>2 THEN
   RAISE EXCEPTION 'unicode-positive-boundary-drift';
 END IF;
 PERFORM public.fn_property_mutation_receipt_result_hash_v2('property.task.claim',target,
  'property-task','occ',repeat('a',64)::char(64),NULL,
  'property-task/'||lower(target::text)||'/v1',1);
 PERFORM public.fn_property_mutation_receipt_result_hash_v2('property.task.claim',target,
  'property-task','occ',repeat('a',64)::char(64),NULL,
  'property-task/'||lower(target::text)||'/v2147483647',2147483647);
 IF failures<>19 THEN RAISE EXCEPTION 'negative-count:%',failures; END IF;
END $gate$;
SELECT count(*) FROM public.biz_property_mutation_receipt WHERE tenant_id='c3-neg';
`);
  assert.equal(output, "0");
});

dbTest("C3-0-010 lifecycle, immutability, terminal no-op and delete are trigger fenced", () => {
  const output = psql(String.raw`
DO $gate$
DECLARE started_id uuid; completed_id uuid; failures integer:=0;
BEGIN
 INSERT INTO public.biz_property_mutation_receipt(tenant_id,park_id,actor_id,action_id,target_id,
  client_key,request_hash,receipt_contract_version)
 VALUES ('c3-life','p1',uuid_generate_v4(),'property.approval.submit',uuid_generate_v4(),
  'started',repeat('a',64),'legacy-v1') RETURNING id INTO started_id;
 UPDATE public.biz_property_mutation_receipt SET receipt_status=receipt_status WHERE id=started_id;
 BEGIN UPDATE public.biz_property_mutation_receipt SET action_id='property.approval.decide' WHERE id=started_id;
  RAISE EXCEPTION 'immutable-update-accepted'; EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN DELETE FROM public.biz_property_mutation_receipt WHERE id=started_id;
  RAISE EXCEPTION 'delete-accepted'; EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 UPDATE public.biz_property_mutation_receipt SET receipt_status='completed',result_ref='legacy/done',
  result_hash=repeat('b',64),completed_at=clock_timestamp() WHERE id=started_id RETURNING id INTO completed_id;
 BEGIN UPDATE public.biz_property_mutation_receipt SET receipt_status=receipt_status WHERE id=completed_id;
  RAISE EXCEPTION 'terminal-noop-accepted'; EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 BEGIN DELETE FROM public.biz_property_mutation_receipt WHERE id=completed_id;
  RAISE EXCEPTION 'terminal-delete-accepted'; EXCEPTION WHEN check_violation THEN failures:=failures+1; END;
 IF failures<>4 THEN RAISE EXCEPTION 'lifecycle-negative-count:%',failures; END IF;
END $gate$;
SELECT receipt_status FROM public.biz_property_mutation_receipt WHERE tenant_id='c3-life';
`);
  assert.equal(output, "completed");
});

dbTest("C3-0-010b projection writer binds stored identity and rolls every forged call back", () => {
  const output = psql(String.raw`
CREATE OR REPLACE FUNCTION pg_temp.c3_projection_row(
 p_task_id uuid,p_task_key text,p_occurrence text,p_source_id uuid)
RETURNS jsonb LANGUAGE sql AS $row$
 SELECT jsonb_build_object(
  'taskId',lower(p_task_id::text),'taskKey',p_task_key,'assignmentAuthority','owning',
  'derivedAssignmentId',NULL,'sourceType','test_fixture_source','sourceId',lower(p_source_id::text),
  'sourceVersion',1,'businessOccurrenceKey',p_occurrence,'taskKind','fixture',
  'queueCode','fixture.queue','title','C3 projection fixture','kindLabel','Fixture',
  'sourceLabel','Fixture source','priority',0,'dueAt',NULL,'assignmentStatus','claimed',
  'assignmentVersion',1,'assigneeId','10000000-0000-0000-0000-000000000009',
  'assigneeDisplay','Fixture actor','claimedAt','2026-08-01T00:00:00.000Z',
  'startedAt',NULL,'blockedReason',NULL,'blockedUntil',NULL,'outcomeCode',NULL,
  'outcomeSourceVersion',NULL,'outcomeAt',NULL,'sourceDeepLink',NULL,
  'contentHash',repeat('0',64),'createdAt','2026-08-01T00:00:00.000Z',
  'updatedAt','2026-08-01T00:00:00.000Z')
$row$;
DO $gate$
DECLARE actor uuid:='10000000-0000-0000-0000-000000000009';
 source uuid:='40000000-0000-0000-0000-000000000001';
 task uuid:='41000000-0000-0000-0000-000000000001';
 target_other uuid:='42000000-0000-0000-0000-000000000001';
 receipt uuid; request_hash text; result_ref text; result_hash text;
 row_good jsonb; row_bad jsonb; row_other jsonb; audits_before bigint; failures integer:=0;
BEGIN
 -- A real successful replacement proves the superseded writer remains callable.
 receipt:='43000000-0000-0000-0000-000000000001'; request_hash:=repeat('1',64);
 result_ref:='property-task-rebuild/test_fixture_source/'||lower(source::text)||'/v1';
 SELECT public.fn_property_mutation_receipt_result_hash_v2('property.task.rebuild',source,
  'property-task-source-rebuild',NULL,NULL,'test_fixture_source',result_ref,1)::text INTO result_hash;
 INSERT INTO public.biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,
  client_key,request_hash,receipt_contract_version,identity_kind,identity_source_type)
 VALUES(receipt,'c3-projection','p1',actor,'property.task.rebuild',source,'success',request_hash,
  'port-v2','property-task-source-rebuild','test_fixture_source');
 row_good:=pg_temp.c3_projection_row(task,repeat('1',64),'projection-success',source);
 row_good:=jsonb_set(row_good,'{contentHash}',to_jsonb(
  public.fn_property_task_projection_row_hash_v1(row_good)::text));
 PERFORM * FROM public.fn_property_task_projection_replace_v1('c3-projection','p1',
  'test_fixture_source',source,actor,receipt,'manual-rebuild','property.task.rebuild',1,0,
  request_hash::char(64),result_ref,result_hash::char(64),'manual fixture',jsonb_build_array(row_good));
 IF (SELECT receipt_status FROM public.biz_property_mutation_receipt WHERE id=receipt)<>'started'
    OR (SELECT count(*) FROM public.biz_property_task_projection_rebuild_audit
        WHERE tenant_id='c3-projection' AND park_id='p1' AND mutation_receipt_id=receipt)<>1 THEN
   RAISE EXCEPTION 'projection-success-postcondition';
 END IF;
 SELECT count(*) INTO audits_before FROM public.biz_property_task_projection_rebuild_audit
  WHERE tenant_id='c3-projection' AND park_id='p1';

 -- Manual wrong target, wrong source type and wrong hash.
 receipt:='43000000-0000-0000-0000-000000000002'; request_hash:=repeat('2',64);
 result_ref:='property-task-rebuild/test_fixture_source/'||lower(target_other::text)||'/v1';
 SELECT public.fn_property_mutation_receipt_result_hash_v2('property.task.rebuild',target_other,
  'property-task-source-rebuild',NULL,NULL,'test_fixture_source',result_ref,1)::text INTO result_hash;
 INSERT INTO public.biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,
  client_key,request_hash,receipt_contract_version,identity_kind,identity_source_type)
 VALUES(receipt,'c3-projection','p1',actor,'property.task.rebuild',target_other,'wrong-target',request_hash,
  'port-v2','property-task-source-rebuild','test_fixture_source');
 BEGIN
  PERFORM * FROM public.fn_property_task_projection_replace_v1('c3-projection','p1',
   'test_fixture_source',source,actor,receipt,'manual-rebuild','property.task.rebuild',1,1,
   request_hash::char(64),result_ref,result_hash::char(64),'manual fixture',jsonb_build_array(row_good));
  RAISE EXCEPTION 'wrong-target-accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN failures:=failures+1; END;

 receipt:='43000000-0000-0000-0000-000000000003'; request_hash:=repeat('3',64);
 result_ref:='property-task-rebuild/stored_source/'||lower(source::text)||'/v1';
 SELECT public.fn_property_mutation_receipt_result_hash_v2('property.task.rebuild',source,
  'property-task-source-rebuild',NULL,NULL,'stored_source',result_ref,1)::text INTO result_hash;
 INSERT INTO public.biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,
  client_key,request_hash,receipt_contract_version,identity_kind,identity_source_type)
 VALUES(receipt,'c3-projection','p1',actor,'property.task.rebuild',source,'wrong-source',request_hash,
  'port-v2','property-task-source-rebuild','stored_source');
 BEGIN
  PERFORM * FROM public.fn_property_task_projection_replace_v1('c3-projection','p1',
   'test_fixture_source',source,actor,receipt,'manual-rebuild','property.task.rebuild',1,1,
   request_hash::char(64),result_ref,result_hash::char(64),'manual fixture',jsonb_build_array(row_good));
  RAISE EXCEPTION 'wrong-source-accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN failures:=failures+1; END;

 receipt:='43000000-0000-0000-0000-000000000004'; request_hash:=repeat('4',64);
 result_ref:='property-task-rebuild/test_fixture_source/'||lower(source::text)||'/v1';
 INSERT INTO public.biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,
  client_key,request_hash,receipt_contract_version,identity_kind,identity_source_type)
 VALUES(receipt,'c3-projection','p1',actor,'property.task.rebuild',source,'wrong-hash',request_hash,
  'port-v2','property-task-source-rebuild','test_fixture_source');
 BEGIN
  PERFORM * FROM public.fn_property_task_projection_replace_v1('c3-projection','p1',
   'test_fixture_source',source,actor,receipt,'manual-rebuild','property.task.rebuild',1,1,
   request_hash::char(64),result_ref,repeat('f',64)::char(64),'manual fixture',jsonb_build_array(row_good));
  RAISE EXCEPTION 'wrong-hash-accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN failures:=failures+1; END;

 -- Authority-sync identity matching is same-row, not independent existential matches.
 receipt:='43000000-0000-0000-0000-000000000005'; request_hash:=repeat('5',64);
 result_ref:='property-task/'||lower(task::text)||'/v1';
 SELECT public.fn_property_mutation_receipt_result_hash_v2('property.task.claim',task,
  'property-task','occurrence-good',repeat('a',64)::char(64),NULL,result_ref,1)::text INTO result_hash;
 INSERT INTO public.biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,
  client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
 VALUES(receipt,'c3-projection','p1',actor,'property.task.claim',task,'wrong-task-key',request_hash,
  'port-v2','property-task','occurrence-good',repeat('a',64));
 row_bad:=pg_temp.c3_projection_row(task,repeat('b',64),'occurrence-good',source);
 row_bad:=jsonb_set(row_bad,'{contentHash}',to_jsonb(public.fn_property_task_projection_row_hash_v1(row_bad)::text));
 BEGIN
  PERFORM * FROM public.fn_property_task_projection_replace_v1('c3-projection','p1',
   'test_fixture_source',source,actor,receipt,'authority-sync','property.task.claim',1,1,
   request_hash::char(64),result_ref,result_hash::char(64),'authority-sync:property.task.claim',jsonb_build_array(row_bad));
  RAISE EXCEPTION 'wrong-task-key-accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN failures:=failures+1; END;

 receipt:='43000000-0000-0000-0000-000000000006'; request_hash:=repeat('6',64);
 INSERT INTO public.biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,
  client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
 VALUES(receipt,'c3-projection','p1',actor,'property.task.claim',task,'wrong-occurrence',request_hash,
  'port-v2','property-task','occurrence-good',repeat('a',64));
 row_bad:=pg_temp.c3_projection_row(task,repeat('a',64),'occurrence-bad',source);
 row_bad:=jsonb_set(row_bad,'{contentHash}',to_jsonb(public.fn_property_task_projection_row_hash_v1(row_bad)::text));
 BEGIN
  PERFORM * FROM public.fn_property_task_projection_replace_v1('c3-projection','p1',
   'test_fixture_source',source,actor,receipt,'authority-sync','property.task.claim',1,1,
   request_hash::char(64),result_ref,result_hash::char(64),'authority-sync:property.task.claim',jsonb_build_array(row_bad));
  RAISE EXCEPTION 'wrong-occurrence-accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN failures:=failures+1; END;

 receipt:='43000000-0000-0000-0000-000000000007'; request_hash:=repeat('7',64);
 INSERT INTO public.biz_property_mutation_receipt(id,tenant_id,park_id,actor_id,action_id,target_id,
  client_key,request_hash,receipt_contract_version,identity_kind,business_occurrence_key,task_key)
 VALUES(receipt,'c3-projection','p1',actor,'property.task.claim',task,'cross-row',request_hash,
  'port-v2','property-task','occurrence-good',repeat('a',64));
 row_bad:=pg_temp.c3_projection_row(task,repeat('a',64),'occurrence-bad',source);
 row_other:=pg_temp.c3_projection_row(target_other,repeat('b',64),'occurrence-good',source);
 row_bad:=jsonb_set(row_bad,'{contentHash}',to_jsonb(public.fn_property_task_projection_row_hash_v1(row_bad)::text));
 row_other:=jsonb_set(row_other,'{contentHash}',to_jsonb(public.fn_property_task_projection_row_hash_v1(row_other)::text));
 BEGIN
  PERFORM * FROM public.fn_property_task_projection_replace_v1('c3-projection','p1',
   'test_fixture_source',source,actor,receipt,'authority-sync','property.task.claim',1,1,
   request_hash::char(64),result_ref,result_hash::char(64),'authority-sync:property.task.claim',
   jsonb_build_array(row_bad,row_other));
  RAISE EXCEPTION 'cross-row-identity-splice-accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN failures:=failures+1; END;

 IF failures<>6 THEN RAISE EXCEPTION 'projection-negative-count:%',failures; END IF;
 IF EXISTS(SELECT 1 FROM public.biz_property_mutation_receipt
   WHERE tenant_id='c3-projection' AND client_key<>'success' AND receipt_status<>'started')
   OR (SELECT count(*) FROM public.biz_property_task_projection_rebuild_audit
       WHERE tenant_id='c3-projection' AND park_id='p1')<>audits_before THEN
  RAISE EXCEPTION 'projection-negative-rollback-pollution';
 END IF;
END $gate$;
SELECT count(*) FILTER (WHERE receipt_status='started'),count(*)
FROM public.biz_property_mutation_receipt WHERE tenant_id='c3-projection';
`);
  assert.equal(output, "7\t7");
});

dbTest("C3-0-011 rerun end-state, 000194 replacement binding, control audit and history are coherent", () => {
  const output = psql(String.raw`
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_property_task_projection_replace_v1';
SELECT count(*) FROM pg_get_functiondef(
  'public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)'::regprocedure
) d WHERE d LIKE '%receipt_contract_version%' AND d LIKE '%port-v2%'
 AND d LIKE '%identity_kind%' AND d LIKE '%result_version%';
SELECT count(DISTINCT (btrim(a.tenant_id),btrim(a.park_id)))
FROM public.rel_tenant_module a JOIN public.sys_module m ON m.id=a.module_id
WHERE m.module_code='asset' AND m.status=1 AND m.is_deleted=false
 AND a.enabled=true AND a.status='enabled' AND a.is_deleted=false
 AND (a.start_time IS NULL OR a.start_time<=clock_timestamp())
 AND (a.expire_time IS NULL OR a.expire_time>clock_timestamp());
SELECT count(*) FILTER (WHERE correction_key='b2a-contract-correction-000194'),
 count(*) FILTER (WHERE correction_key='b2a-contract-correction-000195'),
 count(DISTINCT control_id) FILTER (WHERE correction_key='b2a-contract-correction-000195'),
 bool_and(old_version+1=new_version)
FROM public.sys_property_runtime_control_contract_audit
WHERE correction_key IN ('b2a-contract-correction-000194','b2a-contract-correction-000195');
SELECT count(*) FROM public.sys_property_runtime_control_contract_audit a
WHERE a.correction_key='b2a-contract-correction-000195' AND
 a.evidence_hash IS DISTINCT FROM encode(public.digest(pg_catalog.convert_to(
  'runtime-control-contract-audit-v2'||E'\n'
  ||public.fn_property_task_projection_scalar_v1(a.tenant_id,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(a.park_id,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(a.control_id::text,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(a.control_key,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(a.correction_key,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(a.old_contract_hash,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(a.new_contract_hash,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(a.old_version::text,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(a.new_version::text,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(a.old_disabled_reason,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(a.new_disabled_reason,'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(to_char(a.old_update_time AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\t'
  ||public.fn_property_task_projection_scalar_v1(to_char(a.new_update_time AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'S')||E'\n','UTF8'),'sha256'),'hex');
SELECT count(*) FILTER (WHERE status='succeeded'),count(*)
FROM public.sys_schema_migration_history
WHERE filename='000195_property_mutation_receipt_contract_v2.sql';
SELECT count(*) FROM public.sys_property_runtime_control c
WHERE c.enabled OR c.control_mode<>'disabled'
 OR c.enabled_by IS NOT NULL OR c.enabled_at IS NOT NULL OR c.approval_reference IS NOT NULL;
`);
  const lines = output.split("\n");
  assert.equal(lines[0], "1");
  assert.equal(lines[1], "1");
  assert.equal(lines[2], "2", "isolated gate must expose exactly two qualifying scopes");
  const [oldAudits, newAudits, distinctControls, versions] = lines[3].split("\t");
  assert.equal(oldAudits, "24");
  assert.equal(newAudits, "24");
  assert.equal(newAudits, distinctControls);
  assert.equal(versions, "t");
  assert.equal(lines[4], "0", "000195 control audit evidence hash drift");
  const [succeeded, historyTotal] = lines[5].split("\t");
  assert.ok(Number(succeeded) >= 1, "000195 succeeded history row is absent");
  assert.equal(succeeded, historyTotal, "000195 history contains non-succeeded rows");
  assert.equal(lines[6], "0");
});
