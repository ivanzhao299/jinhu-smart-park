import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL, fileURLToPath } from "node:url";
import {
  ProductionImportPostgresAdapterError,
  createProductionImportPostgresAdapter,
} from "../hr-cutover/production-import-postgres-adapter.mjs";

const H = value => String(value).repeat(64).slice(0, 64);
const binding = () => ({
  database: "jinhu_production",
  databaseUser: "hr_import_role",
  targetIdentitySha256: H("a"),
  targetScope: { tenantId: "tenant-a", parkId: "park-a", scopeSha256: H("b") },
  serverIdentity: { address: "127.0.0.1", port: 5432, databaseOid: "12345" },
});
const probeRow = (overrides = {}) => ({
  database_name: "jinhu_production",
  database_user: "hr_import_role",
  server_address: "127.0.0.1",
  server_port: 5432,
  database_oid: "12345",
  tenant_exists: true,
  park_exists: true,
  ...overrides,
});

function fakeClient(handler = async () => ({ rows: [] })) {
  const calls = [];
  return {
    calls,
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return handler(sql, parameters, calls.length);
    },
  };
}

function adapterFor(client, overrides = {}) {
  return createProductionImportPostgresAdapter({ client, binding: binding(), ownership: "borrowed", ...overrides });
}

test("executes the writer transaction contract with a fixed SERIALIZABLE boundary and local audit purpose", async () => {
  const client = fakeClient();
  const database = adapterFor(client);
  let capturedTx;
  const value = await database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t3" }, async tx => {
    capturedTx = tx;
    await tx.query("SELECT $1::text AS value", ["bound"]);
    return "done";
  });
  assert.equal(value, "done");
  assert.deepEqual(client.calls.map(call => call.sql), [
    "BEGIN",
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
    "SELECT set_config('application_name', $1, true)",
    "SELECT set_config('TimeZone', $1, true)",
    "SELECT $1::text AS value",
    "COMMIT",
  ]);
  assert.deepEqual(client.calls[2].parameters, ["jinhu_hr_prod_import:apply_t0_t3"]);
  assert.deepEqual(client.calls[3].parameters, ["Asia/Shanghai"]);
  assert.deepEqual(client.calls[4].parameters, ["bound"]);
  await assert.rejects(capturedTx.query("SELECT 1", []), error => error.code === "PRODUCTION_IMPORT_PG_TRANSACTION_INACTIVE");
});

test("rejects non-SERIALIZABLE, unknown purpose, and nested transactions before unsafe work", async () => {
  const client = fakeClient();
  const database = adapterFor(client);
  await assert.rejects(database.transaction({ isolationLevel: "READ COMMITTED", purpose: "apply_t0_t3" }, async () => {}), error => error.code === "PRODUCTION_IMPORT_PG_ISOLATION_INVALID");
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "contains-sensitive-detail" }, async () => {}), error => error.code === "PRODUCTION_IMPORT_PG_PURPOSE_INVALID");
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t3" }, async () => {
    await database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "record_import_failure" }, async () => {});
  }), error => error.code === "PRODUCTION_IMPORT_PG_NESTED_TRANSACTION");
  assert.deepEqual(client.calls.map(call => call.sql), [
    "BEGIN",
    "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
    "SELECT set_config('application_name', $1, true)",
    "SELECT set_config('TimeZone', $1, true)",
    "ROLLBACK",
  ]);
});

test("callback errors are never swallowed and a successful rollback makes the borrowed client reusable", async () => {
  const client = fakeClient();
  const database = adapterFor(client);
  const failure = new Error("business write failed");
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t3" }, async () => { throw failure; }), error => error === failure);
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
  await database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "record_import_failure" }, async tx => tx.query("SELECT $1", ["safe"]));
  assert.equal(client.calls.at(-1).sql, "COMMIT");
});

test("commit failure quarantines a pooled client and reports rollback failure without hiding the primary error", async () => {
  const commitFailure = new Error("commit failed");
  const rollbackFailure = new Error("rollback failed");
  const released = [];
  const client = fakeClient(async sql => {
    if (sql === "COMMIT") throw commitFailure;
    if (sql === "ROLLBACK") throw rollbackFailure;
    return { rows: [] };
  });
  client.release = error => released.push(error);
  const pool = { connect: async () => client };
  const database = createProductionImportPostgresAdapter({ pool, binding: binding(), ownership: "borrowed" });
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t3" }, async () => "never"), error => {
    assert.equal(error.code, "PRODUCTION_IMPORT_PG_ROLLBACK_FAILED");
    assert.equal(error.cause, commitFailure);
    assert.deepEqual(error.errors, [commitFailure, rollbackFailure]);
    return true;
  });
  assert.equal(released.length, 1);
  assert(released[0] instanceof Error);
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "record_import_failure" }, async () => {}), error => error.code === "PRODUCTION_IMPORT_PG_CONNECTION_POISONED");
  assert.equal(released.length, 2);
  assert(released[1] instanceof Error);
});

test("commit failure remains the reported error even when defensive rollback succeeds, and the connection stays quarantined", async () => {
  const commitFailure = new Error("commit outcome uncertain");
  const client = fakeClient(async sql => {
    if (sql === "COMMIT") throw commitFailure;
    return { rows: [] };
  });
  const database = adapterFor(client);
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t3" }, async () => "not committed"), error => error === commitFailure);
  assert.equal(client.calls.at(-1).sql, "ROLLBACK");
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "record_import_failure" }, async () => {}), error => error.code === "PRODUCTION_IMPORT_PG_CONNECTION_POISONED");
});

test("ambiguous BEGIN failure quarantines the connection before any retry", async () => {
  const client = fakeClient(async sql => {
    if (sql === "BEGIN") throw new Error("connection interrupted");
    return { rows: [] };
  });
  const database = adapterFor(client);
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t3" }, async () => {}), /connection interrupted/u);
  assert.deepEqual(client.calls.map(call => call.sql), ["BEGIN"]);
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "record_import_failure" }, async () => {}), error => error.code === "PRODUCTION_IMPORT_PG_CONNECTION_POISONED");
});

test("a rollback failure after a callback error quarantines a direct client", async () => {
  const client = fakeClient(async sql => {
    if (sql === "ROLLBACK") throw new Error("rollback unavailable");
    return { rows: [] };
  });
  const database = adapterFor(client);
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t3" }, async () => { throw new Error("write failed"); }), error => error.code === "PRODUCTION_IMPORT_PG_ROLLBACK_FAILED");
  await assert.rejects(database.transaction({ isolationLevel: "SERIALIZABLE", purpose: "record_import_failure" }, async () => {}), error => error.code === "PRODUCTION_IMPORT_PG_CONNECTION_POISONED");
});

test("read-only target probe binds current database, current user, public database catalog identity, and tenant/park scope", async () => {
  const client = fakeClient(async sql => {
    if (sql.includes("current_database()")) return { rows: [probeRow()] };
    return { rows: [] };
  });
  const database = adapterFor(client);
  const expected = binding();
  const observed = await database.probeTarget({ targetIdentitySha256: expected.targetIdentitySha256, targetScope: expected.targetScope });
  assert.deepEqual(observed, { ...expected, readOnlyProbe: true });
  assert.equal(client.calls.length, 1);
  assert.match(client.calls[0].sql, /^SELECT current_database\(\)/u);
  assert.match(client.calls[0].sql, /FROM pg_database WHERE datname=current_database\(\)/u);
  assert.doesNotMatch(client.calls[0].sql, /pg_control_system/u);
  assert.deepEqual(client.calls[0].parameters, ["tenant-a", "park-a"]);

  await assert.rejects(database.probeTarget({ targetIdentitySha256: H("f"), targetScope: expected.targetScope }), error => error.code === "PRODUCTION_IMPORT_PG_TARGET_BINDING_MISMATCH");
  assert.equal(client.calls.length, 1);
});

test("target probe fails closed for connection identity or missing scope", async () => {
  const wrongIdentity = adapterFor(fakeClient(async () => ({ rows: [probeRow({ database_name: "other" })] })));
  const expected = binding();
  await assert.rejects(wrongIdentity.probeTarget({ targetIdentitySha256: expected.targetIdentitySha256, targetScope: expected.targetScope }), error => error.code === "PRODUCTION_IMPORT_PG_CONNECTION_IDENTITY_MISMATCH");
  const wrongServer = adapterFor(fakeClient(async () => ({ rows: [probeRow({ server_address: "127.0.0.2" })] })));
  await assert.rejects(wrongServer.probeTarget({ targetIdentitySha256: expected.targetIdentitySha256, targetScope: expected.targetScope }), error => error.code === "PRODUCTION_IMPORT_PG_SERVER_IDENTITY_MISMATCH");
  const wrongDatabaseIdentity = adapterFor(fakeClient(async () => ({ rows: [probeRow({ database_oid: "67890" })] })));
  await assert.rejects(wrongDatabaseIdentity.probeTarget({ targetIdentitySha256: expected.targetIdentitySha256, targetScope: expected.targetScope }), error => error.code === "PRODUCTION_IMPORT_PG_SERVER_IDENTITY_MISMATCH");
  const missingScope = adapterFor(fakeClient(async () => ({ rows: [probeRow({ park_exists: false })] })));
  await assert.rejects(missingScope.probeTarget({ targetIdentitySha256: expected.targetIdentitySha256, targetScope: expected.targetScope }), error => error.code === "PRODUCTION_IMPORT_PG_TARGET_SCOPE_MISMATCH");
});

test("connection ownership is explicit and no implicit credential or environment path exists", async () => {
  const borrowed = fakeClient();
  borrowed.end = async () => { borrowed.ended = true; };
  const borrowedAdapter = adapterFor(borrowed);
  await borrowedAdapter.close();
  assert.equal(borrowed.ended, undefined);
  await assert.rejects(borrowedAdapter.transaction({ isolationLevel: "SERIALIZABLE", purpose: "apply_t0_t3" }, async () => {}), error => error.code === "PRODUCTION_IMPORT_PG_ADAPTER_CLOSED");

  const owned = fakeClient();
  owned.end = async () => { owned.ended = true; };
  const ownedAdapter = createProductionImportPostgresAdapter({ client: owned, binding: binding(), ownership: "owned" });
  await ownedAdapter.close();
  assert.equal(owned.ended, true);

  assert.throws(() => createProductionImportPostgresAdapter({ client: fakeClient(), binding: binding(), ownership: "borrowed", connectionString: "forbidden" }), error => error.code === "PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID");
  assert.throws(() => createProductionImportPostgresAdapter({ client: fakeClient(), binding: binding(), ownership: "borrowed", password: "forbidden" }), error => error.code === "PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID");
  const source = readFileSync(fileURLToPath(new URL("../hr-cutover/production-import-postgres-adapter.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /process\.env|connectionString|PGPASSWORD|DATABASE_URL|postgres:\/\//u);
  assert.equal(typeof ProductionImportPostgresAdapterError, "function");
});

test("adapter purpose allowlist covers exactly every transaction requested by the existing sealed writer", () => {
  const writer = readFileSync(fileURLToPath(new URL("../hr-cutover/production-import-writer.mjs", import.meta.url)), "utf8");
  const purposes = [...writer.matchAll(/database\.transaction\(\{ isolationLevel: "SERIALIZABLE", purpose: "([a-z0-9_]+)"/gu)].map(match => match[1]);
  assert.deepEqual(purposes, [
    "consume_import_authorization",
    "apply_t0_t3",
    "record_import_failure",
    "consume_rollback_authorization",
    "rollback_t3_t0",
    "record_rollback_failure",
  ]);
});

test("close fails while a read-only probe owns the connection", async () => {
  let unblock;
  const blocked = new Promise(resolve => { unblock = resolve; });
  let probeStarted;
  const started = new Promise(resolve => { probeStarted = resolve; });
  const client = fakeClient(async () => {
    probeStarted();
    await blocked;
    return { rows: [probeRow()] };
  });
  client.end = async () => {};
  const database = createProductionImportPostgresAdapter({ client, binding: binding(), ownership: "owned" });
  const expected = binding();
  const probe = database.probeTarget({ targetIdentitySha256: expected.targetIdentitySha256, targetScope: expected.targetScope });
  await started;
  await assert.rejects(database.close(), error => error.code === "PRODUCTION_IMPORT_PG_ADAPTER_BUSY");
  unblock();
  await probe;
  await database.close();
});
