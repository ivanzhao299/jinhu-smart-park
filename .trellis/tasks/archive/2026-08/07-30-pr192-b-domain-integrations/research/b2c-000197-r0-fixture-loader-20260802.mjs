import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const migrations = resolve(root, "database/migrations");
const runId = "b2c197_r0_20260802a";
const targets = {
  upgrade: {
    container: "jinhu-b2c197-r0-20260802a-a",
    database: "jinhu_b2c197_a",
  },
  fresh: {
    container: "jinhu-b2c197-r0-20260802a-b",
    database: "jinhu_b2c197_b",
  },
};
const chainBeforeForwardFix = [
  "000185_property_b_identity_schema_expand.sql",
  "000186_property_b_approval_runtime_schema.sql",
  "000187_property_b_event_notification_schema.sql",
  "000188_property_b_task_runtime_schema.sql",
  "000189_property_b_module_rbac_definitions.sql",
  "000190_property_b_migration_compatibility_control.sql",
];
const forwardFixChain = [
  "000193_property_b_runtime_integrity_forward_fix.sql",
  "000194_property_task_projection_contract_correction.sql",
  "000195_property_mutation_receipt_contract_v2.sql",
];
const baseline = readdirSync(migrations).filter((name) => {
  const number = Number(name.match(/^(\d{6})_.*\.sql$/)?.[1]);
  return Number.isInteger(number) && number <= 182 && number !== 175;
}).sort();

function dockerExec(target, sql) {
  const result = spawnSync("docker", [
    "exec", "-i", target.container, "psql", "-X", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", target.database,
  ], { cwd: root, input: `\\set VERBOSITY verbose\n${sql}`, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${target.container}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function apply(target, filename) {
  dockerExec(target, readFileSync(resolve(migrations, filename), "utf8"));
}

function ensureHistory(target) {
  dockerExec(target, `
    CREATE TABLE IF NOT EXISTS public.sys_schema_migration_history (
      id bigserial PRIMARY KEY, filename varchar(255) NOT NULL UNIQUE,
      checksum varchar(64) NOT NULL, status varchar(16) NOT NULL
        CHECK(status IN ('running','succeeded','failed')),
      started_at timestamptz NOT NULL, finished_at timestamptz, error_message text,
      executed_by varchar(255) NOT NULL, batch_id varchar(32) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS public.schema_migrations
      (LIKE public.sys_schema_migration_history INCLUDING ALL);`);
}

function record(target, filename, phase) {
  const checksum = createHash("sha256").update(readFileSync(resolve(migrations, filename))).digest("hex");
  dockerExec(target, `BEGIN;
    INSERT INTO public.sys_schema_migration_history
      (filename,checksum,status,started_at,finished_at,executed_by,batch_id)
      VALUES ('${filename}','${checksum}','succeeded',clock_timestamp(),clock_timestamp(),
        'b2c-000197-r0-owner','${runId.slice(0, 25)}-${phase}');
    INSERT INTO public.schema_migrations
      (filename,checksum,status,started_at,finished_at,executed_by,batch_id)
      SELECT filename,checksum,status,started_at,finished_at,executed_by,batch_id
      FROM public.sys_schema_migration_history WHERE filename='${filename}';
    COMMIT;`);
}

function bootstrap(target) {
  for (const filename of baseline) apply(target, filename);
  dockerExec(target, readFileSync(resolve(root, "database/seeds/000001_s1_production_core.sql"), "utf8"));
  apply(target, "000183_property_business_granular_rbac.sql");
  apply(target, "000184_property_workbench_read_permissions.sql");
  dockerExec(target, `BEGIN;
    INSERT INTO sys_tenant(tenant_id,park_id,tenant_code,tenant_name,tenant_type,status,max_users,max_parks,plan_code,remark)
    VALUES ('10000002','0','B2C_R0_SECOND','B2c R0 second qualifying tenant','park_operator',1,0,0,'GROUP','multi-scope R0 fixture');
    INSERT INTO asset_park(tenant_id,park_id,park_code,park_name,status,is_deleted,version,remark)
    VALUES ('10000001','20000001','B2C_R0_GATE','B2c R0 isolated park','enabled',false,1,'first qualifying scope'),
           ('10000002','20000002','B2C_R0_GATE_2','B2c R0 second park','enabled',false,1,'second qualifying scope');
    INSERT INTO rel_tenant_module(tenant_id,park_id,tenant_code,module_id,status,enabled,is_deleted,version,remark)
    SELECT '10000002','20000002','B2C_R0_SECOND',m.id,'enabled',true,false,1,'multi-scope asset assignment'
    FROM sys_module m WHERE m.module_code='asset' AND m.status=1 AND m.is_deleted=false ORDER BY m.id LIMIT 1;
    CREATE TEMP TABLE b2c_r0_permission_fixture_map(
      source_id uuid PRIMARY KEY, fixture_id uuid NOT NULL UNIQUE) ON COMMIT DROP;
    INSERT INTO b2c_r0_permission_fixture_map(source_id,fixture_id)
    SELECT permission.id,uuid_generate_v4() FROM sys_permission permission
    WHERE permission.tenant_id='10000001' AND permission.is_enabled=true
      AND permission.status='enabled' AND permission.is_deleted=false;
    INSERT INTO sys_permission(
      id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,
      permission_level,level,sort_no,permission_type,perm_type,api_method,api_path,frontend_route,
      component_key,icon,keep_alive,always_show,field_key,data_dimension,is_system,is_builtin,
      is_tenant_custom,visible,is_enabled,status,create_by,create_time,update_by,update_time,
      is_deleted,version,remark)
    SELECT fixture.fixture_id,'10000002','20000002',permission.code,permission.name,NULL,
      permission.resource,permission.action,permission.permission_path,permission.perm_path,
      permission.permission_level,permission.level,permission.sort_no,permission.permission_type,
      permission.perm_type,permission.api_method,permission.api_path,permission.frontend_route,
      permission.component_key,permission.icon,permission.keep_alive,permission.always_show,
      permission.field_key,permission.data_dimension,permission.is_system,permission.is_builtin,
      permission.is_tenant_custom,permission.visible,permission.is_enabled,permission.status,
      permission.create_by,permission.create_time,permission.update_by,permission.update_time,
      false,permission.version,'B2c R0 exact production permission subtree fixture'
    FROM sys_permission permission
    JOIN b2c_r0_permission_fixture_map fixture ON fixture.source_id=permission.id;
    UPDATE sys_permission target SET parent_id=parent_fixture.fixture_id
    FROM b2c_r0_permission_fixture_map child_fixture
    JOIN sys_permission source ON source.id=child_fixture.source_id
    JOIN b2c_r0_permission_fixture_map parent_fixture ON parent_fixture.source_id=source.parent_id
    WHERE target.id=child_fixture.fixture_id;
    COMMIT;`);
  ensureHistory(target);
}

function applyRecorded(target, files, phase) {
  for (const filename of files) {
    apply(target, filename);
    record(target, filename, phase);
  }
}

bootstrap(targets.upgrade);
applyRecorded(targets.upgrade, chainBeforeForwardFix, "u1");
applyRecorded(targets.upgrade, forwardFixChain, "u2");

bootstrap(targets.fresh);
applyRecorded(targets.fresh, [...chainBeforeForwardFix, ...forwardFixChain], "f1");

process.stdout.write(`${JSON.stringify({ status: "passed", run_id: runId, targets })}\n`);
