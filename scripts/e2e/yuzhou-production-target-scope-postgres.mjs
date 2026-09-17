#!/usr/bin/env node
// Disposable synthetic cluster. No connection to any existing database.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import console from "node:console";
import { buildProductionTargetInventorySql } from "../hr-cutover/materialize-production-target-inventory.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

const root = mkdtempSync(join(tmpdir(), "yuzhou-scope-fixture-"));
const data = join(root, "pg");
const bin = process.env.YUZHOU_SCOPE_POSTGRES_BIN ?? "";
const call = (name, args, input) => {
  const result = spawnSync(bin ? join(bin, name) : name, args, { input, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, `${name} failed: ${result.error?.code ?? result.stderr}`);
  return result.stdout.trim();
};
let started = false;
try {
  call("initdb", ["-D", data, "-U", "fixture", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  // Private socket directory, TCP disabled; does not reuse a running server.
  call("pg_ctl", ["-D", data, "-l", join(root, "server.log"), "-o", `-F -k ${root} -c listen_addresses='' -p 55489`, "-w", "start"]);
  started = true;
  const query = sql => call("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55489", "-U", "fixture", "-d", "postgres"], sql);
  query(`
    CREATE TABLE sys_module(id text,module_code text,is_deleted boolean);
    CREATE TABLE rel_tenant_module(tenant_id text,park_id text,module_id text,enabled boolean,status text,is_deleted boolean,start_time timestamptz,expire_time timestamptz);
    CREATE TABLE sys_tenant(tenant_id text,status integer,is_deleted boolean,expire_time timestamptz);
    CREATE TABLE biz_park(tenant_id text,park_id text,status integer,is_deleted boolean);
    INSERT INTO sys_module VALUES ('module','hr',false);
    INSERT INTO rel_tenant_module SELECT 't'||n,'p'||n,'module',true,'enabled',false,NULL,NULL FROM generate_series(1,3) n;
    INSERT INTO sys_tenant SELECT 't'||n,1,false,NULL FROM generate_series(1,3) n;
    INSERT INTO biz_park SELECT 't'||n,'p'||n,1,false FROM generate_series(1,3) n;
  `);
  const count = hash => {
    const sql = buildProductionTargetInventorySql(hash);
    const end = sql.indexOf(", target_rows AS (");
    assert.ok(end > 0);
    return Number(query(sql.slice(0, end) + " SELECT count(*) FROM single_scope; COMMIT;"));
  };
  const hash = computeProductionImportTargetScopeHash({ tenantId: "t2", parkId: "p2" });
  assert.equal(count(""), 0, "ambiguous unselected scope must fail closed");
  assert.equal(count(hash), 1, "exact hash selects one of three active scopes");
  assert.equal(count("a".repeat(64)), 0, "unknown hash cannot fall back");
  query("UPDATE rel_tenant_module SET enabled=false WHERE tenant_id='t2';");
  assert.equal(count(hash), 0, "disabled target cannot be selected");
  query("UPDATE rel_tenant_module SET enabled=true WHERE tenant_id='t2'; UPDATE sys_tenant SET expire_time=now()-interval '1 day' WHERE tenant_id='t2';");
  assert.equal(count(hash), 0, "expired tenant cannot be selected");
  assert.throws(() => buildProductionTargetInventorySql("' OR true --"));
  console.log("PASS: PostgreSQL multi-scope selection, unknown, disabled, expired and injection cases");
} finally {
  // Never delete an active cluster after a failed shutdown.
  if (started) call("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(root, { recursive: true });
}
