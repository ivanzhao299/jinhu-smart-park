import { AsyncLocalStorage } from "node:async_hooks";

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_DATABASE_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/u;
const PRODUCTION_IMPORT_BUSINESS_TIME_ZONE = "Asia/Shanghai";
const ALLOWED_PURPOSES = new Set([
  "consume_import_authorization",
  "apply_t0_t3",
  "record_import_failure",
  "consume_rollback_authorization",
  "rollback_t3_t0",
  "record_rollback_failure",
]);
const transactionContext = new AsyncLocalStorage();

export class ProductionImportPostgresAdapterError extends Error {
  constructor(code, detail, options = undefined) {
    super(`${code}: ${detail}`, options);
    this.name = "ProductionImportPostgresAdapterError";
    this.code = code;
  }
}

const fail = (code, detail, options) => {
  throw new ProductionImportPostgresAdapterError(code, detail, options);
};

function exactKeys(value, required, optional, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(value, key)) fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", `${label}.${key} is required`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", `${label}.${key} is not allowed`);
}

function validateBinding(binding) {
  exactKeys(binding, ["database", "databaseUser", "targetIdentitySha256", "targetScope", "serverIdentity"], [], "binding");
  if (!SAFE_DATABASE_ID.test(binding.database) || !SAFE_DATABASE_ID.test(binding.databaseUser)) fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", "database identity is invalid");
  if (!SHA256.test(binding.targetIdentitySha256)) fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", "target identity hash is invalid");
  exactKeys(binding.targetScope, ["tenantId", "parkId", "scopeSha256"], [], "binding.targetScope");
  if (typeof binding.targetScope.tenantId !== "string" || binding.targetScope.tenantId.length === 0 || typeof binding.targetScope.parkId !== "string" || binding.targetScope.parkId.length === 0 || !SHA256.test(binding.targetScope.scopeSha256)) {
    fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", "target scope is invalid");
  }
  exactKeys(binding.serverIdentity, ["address", "port", "databaseOid"], [], "binding.serverIdentity");
  if (typeof binding.serverIdentity.address !== "string" || binding.serverIdentity.address.length === 0 || binding.serverIdentity.address.length > 255 || !Number.isSafeInteger(binding.serverIdentity.port) || binding.serverIdentity.port < 1 || binding.serverIdentity.port > 65535 || !/^[0-9]{1,20}$/u.test(binding.serverIdentity.databaseOid ?? "")) {
    fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", "server/database identity is invalid");
  }
  return {
    database: binding.database,
    databaseUser: binding.databaseUser,
    targetIdentitySha256: binding.targetIdentitySha256,
    targetScope: {
      tenantId: binding.targetScope.tenantId,
      parkId: binding.targetScope.parkId,
      scopeSha256: binding.targetScope.scopeSha256,
    },
    serverIdentity: {
      address: binding.serverIdentity.address,
      port: binding.serverIdentity.port,
      databaseOid: binding.serverIdentity.databaseOid,
    },
  };
}

function assertQueryClient(client, label) {
  if (!client || typeof client.query !== "function") fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", `${label} must expose query(sql, parameters)`);
}

function unwrapRows(result, label) {
  if (!result || !Array.isArray(result.rows)) fail("PRODUCTION_IMPORT_PG_RESULT_INVALID", `${label} did not return rows`);
  return result.rows;
}

function sameScope(left, right) {
  return left?.tenantId === right?.tenantId && left?.parkId === right?.parkId && left?.scopeSha256 === right?.scopeSha256;
}

function auditApplicationName(purpose) {
  if (!ALLOWED_PURPOSES.has(purpose)) fail("PRODUCTION_IMPORT_PG_PURPOSE_INVALID", "transaction purpose is not allowlisted");
  return `jinhu_hr_prod_import:${purpose}`;
}

function combineTransactionErrors(primary, rollback) {
  const error = new ProductionImportPostgresAdapterError(
    "PRODUCTION_IMPORT_PG_ROLLBACK_FAILED",
    "transaction failed and rollback did not complete; connection was quarantined",
    { cause: primary },
  );
  error.errors = [primary, rollback];
  return error;
}

/**
 * Creates the database adapter consumed by executeSealedProductionImport.
 *
 * The caller must inject exactly one already-configured pg-compatible Pool or
 * Client. This module deliberately has no connection-string, environment, CLI,
 * or credential-loading path. `ownership: "borrowed"` never closes the injected
 * object; `ownership: "owned"` closes it only when adapter.close() is called.
 */
export function createProductionImportPostgresAdapter(options) {
  exactKeys(options, ["binding", "ownership"], ["pool", "client"], "options");
  if ((options.pool ? 1 : 0) + (options.client ? 1 : 0) !== 1) fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", "inject exactly one pool or client");
  if (!new Set(["borrowed", "owned"]).has(options.ownership)) fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", "ownership must be borrowed or owned");
  if (options.pool) {
    if (typeof options.pool.connect !== "function") fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", "pool must expose connect()");
    if (options.ownership === "owned" && typeof options.pool.end !== "function") fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", "owned pool must expose end()");
  } else {
    assertQueryClient(options.client, "client");
    if (options.ownership === "owned" && typeof options.client.end !== "function") fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", "owned client must expose end()");
  }

  const binding = validateBinding(options.binding);
  const poisonedClients = new WeakSet();
  const busyClients = new WeakSet();
  let closed = false;
  let activeLeases = 0;

  async function acquire() {
    if (closed) fail("PRODUCTION_IMPORT_PG_ADAPTER_CLOSED", "adapter is closed");
    const client = options.pool ? await options.pool.connect() : options.client;
    assertQueryClient(client, "acquired client");
    if (poisonedClients.has(client)) {
      if (options.pool && typeof client.release === "function") client.release(new Error("production import transaction connection remains quarantined"));
      fail("PRODUCTION_IMPORT_PG_CONNECTION_POISONED", "connection has an uncertain transaction state");
    }
    if (busyClients.has(client)) fail("PRODUCTION_IMPORT_PG_CONCURRENT_CLIENT_USE", "client already has an active operation");
    busyClients.add(client);
    activeLeases += 1;
    return client;
  }

  function release(client, poison = false) {
    busyClients.delete(client);
    activeLeases -= 1;
    if (poison) poisonedClients.add(client);
    if (options.pool && typeof client.release === "function") client.release(poison ? new Error("production import transaction connection quarantined") : undefined);
  }

  async function probeTarget(expected) {
    exactKeys(expected, ["targetIdentitySha256", "targetScope"], [], "probe");
    if (expected.targetIdentitySha256 !== binding.targetIdentitySha256 || !sameScope(expected.targetScope, binding.targetScope)) {
      fail("PRODUCTION_IMPORT_PG_TARGET_BINDING_MISMATCH", "requested target differs from the injected adapter binding");
    }
    const client = await acquire();
    try {
      const rows = unwrapRows(await client.query(
        `SELECT current_database() AS database_name,
                current_user AS database_user,
                inet_server_addr()::text AS server_address,
                inet_server_port()::integer AS server_port,
                (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,
                EXISTS (
                  SELECT 1 FROM sys_tenant tenant
                  WHERE btrim(tenant.tenant_id::text) = $1
                    AND tenant.status = 1
                    AND tenant.is_deleted = false
                    AND (tenant.expire_time IS NULL OR tenant.expire_time > clock_timestamp())
                ) AS tenant_exists,
                EXISTS (
                  SELECT 1 FROM biz_park park
                  WHERE btrim(park.tenant_id::text) = $1
                    AND btrim(park.park_id::text) = $2
                    AND park.status = 1
                    AND park.is_deleted = false
                ) AS park_exists`,
        [binding.targetScope.tenantId, binding.targetScope.parkId],
      ), "target probe");
      if (rows.length !== 1) fail("PRODUCTION_IMPORT_PG_RESULT_INVALID", "target probe did not return exactly one row");
      const row = rows[0];
      if (row.database_name !== binding.database || row.database_user !== binding.databaseUser) fail("PRODUCTION_IMPORT_PG_CONNECTION_IDENTITY_MISMATCH", "database or user differs from the sealed adapter binding");
      if (row.server_address !== binding.serverIdentity.address || Number(row.server_port) !== binding.serverIdentity.port || row.database_oid !== binding.serverIdentity.databaseOid) fail("PRODUCTION_IMPORT_PG_SERVER_IDENTITY_MISMATCH", "server address, port, or database identity differs from the sealed adapter binding");
      if (row.tenant_exists !== true || row.park_exists !== true) fail("PRODUCTION_IMPORT_PG_TARGET_SCOPE_MISMATCH", "tenant/park scope is absent from the connected database");
      return Object.freeze({
        database: row.database_name,
        databaseUser: row.database_user,
        targetIdentitySha256: binding.targetIdentitySha256,
        targetScope: { ...binding.targetScope },
        serverIdentity: { ...binding.serverIdentity },
        readOnlyProbe: true,
      });
    } finally {
      release(client);
    }
  }

  async function transaction(transactionOptions, callback) {
    exactKeys(transactionOptions, ["isolationLevel", "purpose"], [], "transaction options");
    if (transactionOptions.isolationLevel !== "SERIALIZABLE") fail("PRODUCTION_IMPORT_PG_ISOLATION_INVALID", "only SERIALIZABLE is permitted");
    if (typeof callback !== "function") fail("PRODUCTION_IMPORT_PG_ADAPTER_CONFIG_INVALID", "transaction callback is required");
    if (transactionContext.getStore()?.adapter === adapter) fail("PRODUCTION_IMPORT_PG_NESTED_TRANSACTION", "nested transactions are not permitted");
    const applicationName = auditApplicationName(transactionOptions.purpose);
    const client = await acquire();
    let began = false;
    let finalized = false;
    let txActive = true;
    let poison = false;
    const tx = Object.freeze({
      async query(sql, parameters = []) {
        if (!txActive) fail("PRODUCTION_IMPORT_PG_TRANSACTION_INACTIVE", "transaction handle cannot be reused after completion");
        if (typeof sql !== "string" || sql.length === 0 || !Array.isArray(parameters)) fail("PRODUCTION_IMPORT_PG_QUERY_INVALID", "query must use sql text and a parameter array");
        return client.query(sql, parameters);
      },
    });
    try {
      await client.query("BEGIN", []);
      began = true;
      await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE", []);
      await client.query("SELECT set_config('application_name', $1, true)", [applicationName]);
      await client.query("SELECT set_config('TimeZone', $1, true)", [PRODUCTION_IMPORT_BUSINESS_TIME_ZONE]);
      const result = await transactionContext.run({ adapter }, () => callback(tx));
      txActive = false;
      try {
        await client.query("COMMIT", []);
        finalized = true;
        return result;
      } catch (commitError) {
        poison = true;
        try {
          await client.query("ROLLBACK", []);
        } catch (rollbackError) {
          throw combineTransactionErrors(commitError, rollbackError);
        }
        throw commitError;
      }
    } catch (error) {
      txActive = false;
      // A failed BEGIN can be a transport-level ambiguous result. There is no
      // safe rollback handle yet, so never return that connection to service.
      if (!began) poison = true;
      if (began && !finalized && !poison) {
        try {
          await client.query("ROLLBACK", []);
        } catch (rollbackError) {
          poison = true;
          throw combineTransactionErrors(error, rollbackError);
        }
      }
      throw error;
    } finally {
      txActive = false;
      release(client, poison);
    }
  }

  async function close() {
    if (closed) return;
    if (activeLeases !== 0) fail("PRODUCTION_IMPORT_PG_ADAPTER_BUSY", "cannot close with an active transaction or probe");
    closed = true;
    if (options.ownership === "owned") await (options.pool ?? options.client).end();
  }

  const adapter = Object.freeze({ transaction, probeTarget, close, ownership: options.ownership });
  return adapter;
}
