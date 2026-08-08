import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ANOMALY_TRANSITION_FUNCTIONS,
  B_CONTRACT_SHA,
  B_ENDPOINT_AUTHORITY_RAW_SHA256,
  B_MIGRATIONS,
  B_SCHEMA_CATALOG_GRAMMAR,
  B_SCHEMA_CATALOG_V2_POLICY,
  B_SCHEMA_MANIFEST_GRAMMAR,
  B_SCHEMA_SECURITY_GRAMMAR,
  FROZEN_INPUTS,
  IDENTITY_COMMAND_FUNCTIONS,
  IDENTITY_CONSTRAINT_TRIGGERS,
  IDENTITY_IMMEDIATE_TRIGGERS,
  IDENTITY_TRIGGER_FUNCTIONS,
  assertNoTrackBDatabaseOverrides,
  contractManifestBytes,
  parseCatalogMarkers,
  parseSignedDefinitionContract,
  runDeterminismGate,
  schemaManifestBytes,
  sha256,
  validateDefinitionFixture,
  validateSecurityFixture,
  validateStaticContract,
  waitForFinalPostgres
} from "../track-b-schema-expand.mjs";

test("B0-SCHEMA-001 four-input digest grammar is frozen", () => {
  assert.equal(sha256(contractManifestBytes()), B_CONTRACT_SHA);
  assert.equal(
    B_ENDPOINT_AUTHORITY_RAW_SHA256,
    "9fd05b0249b7e873bc250154f13f0b4a903ec998139189295f35c977f09387e1"
  );
  assert.equal(FROZEN_INPUTS.length, 4);
  assert.equal(contractManifestBytes().endsWith("\n"), true);
  assert.equal(contractManifestBytes().includes("\r"), false);
});

test("B0-SCHEMA-002 database override guards fail closed", () => {
  assert.doesNotThrow(() => assertNoTrackBDatabaseOverrides({}));
  for (const key of [
    "DATABASE_URL", "POSTGRES_URL", "PROPERTY_TRACK_B_DATABASE_URL",
    "PROPERTY_B_SCHEMA_DATABASE_URL", "PGHOST", "PGPORT", "PGDATABASE",
    "PGUSER", "PGPASSWORD"
  ]) {
    assert.throws(
      () => assertNoTrackBDatabaseOverrides({ [key]: "not-allowed" }),
      /overrides are forbidden/
    );
  }
});

test("B0-SCHEMA-003 marker parser rejects missing and duplicate targets", () => {
  assert.throws(() => parseCatalogMarkers("BEGIN;\nCOMMIT;\n", "missing.sql"), /no B0 catalog markers/);
  assert.throws(
    () => parseCatalogMarkers(
      "-- B0_CATALOG_OBJECT table\tpublic.example\n" +
      "-- B0_CATALOG_OBJECT table\tpublic.example\n",
      "duplicate.sql"
    ),
    /duplicate B0 catalog markers/
  );
  assert.deepEqual(
    parseCatalogMarkers("-- B0_CATALOG_OBJECT table\tpublic.example\n", "valid.sql"),
    [{ kind: "table", name: "public.example" }]
  );
});

test("B0-SCHEMA-004 migration exact set, transaction, safety and markers validate", () => {
  const entries = validateStaticContract();
  assert.deepEqual(entries.map(({ filename }) => filename), B_MIGRATIONS);
  assert.equal(entries.every(({ sha }) => /^[a-f0-9]{64}$/.test(sha)), true);
  assert.equal(entries.every(({ markers }) => markers.length > 0), true);
});

test("B0-SCHEMA-005 schema manifest is ordered, LF-only and catalog-bound", () => {
  const entries = B_MIGRATIONS.map((filename, index) => ({
    filename,
    sha: String(index + 1).repeat(64)
  }));
  const catalogSha = "a".repeat(64);
  const securitySha = "b".repeat(64);
  const bytes = schemaManifestBytes(entries, catalogSha, securitySha);
  assert.match(bytes, /^b0-schema-expand-v2\n000185_/);
  assert.equal(B_SCHEMA_CATALOG_GRAMMAR, "b0-schema-catalog-v2");
  assert.equal(B_SCHEMA_SECURITY_GRAMMAR, "b0-schema-security-v1");
  assert.equal(B_SCHEMA_MANIFEST_GRAMMAR, "b0-schema-expand-v2");
  assert.deepEqual(B_SCHEMA_CATALOG_V2_POLICY.scopeNormalization, {
    tenant: "sys_tenant.tenant_id",
    park: "asset_park.park_id"
  });
  assert.equal(
    B_SCHEMA_CATALOG_V2_POLICY.excludedEphemeralInputs.includes("generated_timestamp"),
    true
  );
  assert.match(bytes, new RegExp(`catalog\\t${catalogSha}\\n`));
  assert.match(bytes, new RegExp(`security\\t${securitySha}\\n$`));
  assert.equal(bytes.includes("\r"), false);
  assert.match(sha256(bytes), /^[a-f0-9]{64}$/);
});

test("B0-SCHEMA-006 identity authority exact function and trigger counts are frozen", () => {
  assert.equal(IDENTITY_COMMAND_FUNCTIONS.length, 6);
  assert.equal(IDENTITY_TRIGGER_FUNCTIONS.length, 4);
  assert.equal(IDENTITY_IMMEDIATE_TRIGGERS.length, 3);
  assert.equal(IDENTITY_CONSTRAINT_TRIGGERS.length, 4);
  assert.equal(new Set([
    ...IDENTITY_COMMAND_FUNCTIONS,
    ...IDENTITY_TRIGGER_FUNCTIONS,
    ...ANOMALY_TRANSITION_FUNCTIONS
  ]).size, 11);
  assert.deepEqual(
    ANOMALY_TRANSITION_FUNCTIONS,
    ["fn_transition_property_migration_anomaly"]
  );
  assert.equal(new Set([
    ...IDENTITY_IMMEDIATE_TRIGGERS,
    ...IDENTITY_CONSTRAINT_TRIGGERS
  ]).size, 7);
});

test("B0-SCHEMA-007 deterministic Gate rejects fewer than three fresh runs", async () => {
  await assert.rejects(
    () => runDeterminismGate({}, 2),
    /requires 3 to 5 fresh PostgreSQL runs/
  );
});

test("B0-SCHEMA-008 v2 catalog uses validated business scope keys", () => {
  const source = readFileSync(
    new URL("../track-b-schema-expand.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /CREATE TEMP TABLE b0_scope_canonical/);
  assert.match(source, /CREATE TEMP TABLE b0_permission_scope_canonical/);
  assert.match(source, /JOIN b0_permission_scope_canonical permission_scope/);
  assert.match(source, /'tenantId',canonical_scope\.tenant_key/);
  assert.match(source, /'parkId',canonical_scope\.park_key/);
  assert.match(source, /JOIN b0_scope_canonical canonical_scope/);
  assert.doesNotMatch(
    source,
    /'definition\.permission\.'\|\|lower\(p\.tenant_id::text\)/
  );
  assert.doesNotMatch(
    source,
    /'definition\.runtime-control\.'\|\|\s*c\.tenant_id\|\|'\.'\|\|c\.park_id/
  );
});

test("B0-SCHEMA-009 signed business-scope definition counts are exact", () => {
  const entries = B_MIGRATIONS.map((filename) => ({
    filename,
    sql: readFileSync(
      new URL(`../../../../database/migrations/${filename}`, import.meta.url),
      "utf8"
    )
  }));
  const signed = parseSignedDefinitionContract(entries);
  assert.equal(signed.permissionCodes.length, 25);
  assert.equal(signed.runtimeControls.length, 12);
  assert.equal(signed.bundles.length, 16);
  assert.equal(signed.bundleMembers.length, 125);
  assert.equal(signed.dependencies.length, 2);
  const definitions = entries.find(({ filename }) => filename.startsWith("000189_")).sql;
  assert.match(
    definitions,
    /\/api\/v1\/property\/identity-submissions\/:submissionId\/decisions/
  );
  assert.match(definitions, /\/api\/v1\/property\/tasks\/:taskId\/start/);
  assert.match(definitions, /\/api\/v1\/property\/tasks\/:taskId\/unblock/);
  assert.match(
    definitions,
    /\/api\/v1\/property\/occupancies\/:occupancyId\/release/
  );
  assert.doesNotMatch(definitions, /\/api\/v1\/property\/(?:tasks|occupancies)\/:id(?:\/|')/);
});

test("B0-SCHEMA-010 business preflight and exact-set fixtures fail closed", () => {
  const signed = {
    permissionCodes: ["p1", "p2"],
    runtimeControls: [{ key: "c1" }, { key: "c2" }],
    bundles: [{ code: "b1" }],
    dependencies: [{ moduleCode: "m1", requiredModuleCode: "asset" }]
  };
  const scope = {
    tenantKey: "tenant-1",
    parkKey: "park-1",
    tenantEntityUuid: "tenant-uuid-1",
    parkEntityUuid: "park-uuid-1",
    active: true,
    deleted: false,
    orphan: false,
    global: false
  };
  const fixture = {
    scopes: [scope],
    permissions: ["p1", "p2"],
    controls: ["c1", "c2"],
    bundles: ["b1"],
    dependencies: ["m1\tasset"],
    definitionNames: ["definition.permission.tenant-id:tenant-1.p1"]
  };
  assert.equal(validateDefinitionFixture(fixture, signed), true);
  assert.throws(
    () => validateDefinitionFixture({
      ...fixture,
      scopes: [
        scope,
        { ...scope }
      ]
    }, signed),
    /canonical-scope-duplicate/
  );
  for (const drift of [
    { active: false },
    { parkKey: " " },
    { parkKey: "all" },
    { tenantKey: "0" },
    { tenantKey: "00000000-0000-0000-0000-000000000000" },
    { orphan: true },
    { global: true }
  ]) {
    assert.throws(
      () => validateDefinitionFixture({
        ...fixture, scopes: [{ ...scope, ...drift }]
      }, signed),
      /definition-scope-preflight-failed/
    );
  }
  assert.throws(
    () => validateDefinitionFixture({
      ...fixture, permissions: ["p1", "extra"]
    }, signed),
    /permission-exact-set-drift/
  );
  for (const [field, drift, pattern] of [
    ["controls", ["c1", "extra"], /runtime-control-exact-set-drift/],
    ["bundles", ["extra"], /bundle-exact-set-drift/],
    ["dependencies", ["m1\textra"], /dependency-exact-set-drift/]
  ]) {
    assert.throws(
      () => validateDefinitionFixture({ ...fixture, [field]: drift }, signed),
      pattern
    );
  }
  assert.throws(
    () => validateDefinitionFixture({
      ...fixture, scopes: [{ ...scope, parkKey: null }]
    }, signed),
    /definition-scope-preflight-failed/
  );
  assert.throws(
    () => validateDefinitionFixture({
      ...fixture,
      definitionNames: [
        "definition.permission.tenant-id:tenant-1.p1",
        "definition.permission.tenant-id:tenant-1.p1"
      ]
    }, signed),
    /definition-name-duplicate/
  );
});

test("B0-SCHEMA-011 security artifact fixtures reject every signed drift dimension", () => {
  const fixture = {
    ownerClass: "schema-owner",
    ownerIsApplication: false,
    language: "plpgsql",
    securityDefiner: true,
    volatility: "v",
    functionConfig: ["search_path=pg_catalog"],
    publicCreate: false,
    applicationCreateViolationCount: 0,
    ownerOnlyExecute: true,
    directDmlAllowed: false,
    anomalyUpdateDeleteAllowed: false,
    approvedCommandExecute: true,
    rowSetExact: true,
    factsExact: true,
    ephemeralLeak: false
  };
  assert.equal(validateSecurityFixture(fixture), true);
  for (const [drift, pattern] of [
    [{ ownerClass: "application-role" }, /owner-drift/],
    [{ ownerIsApplication: true }, /application-owner-drift/],
    [{ language: "sql" }, /language-drift/],
    [{ securityDefiner: false }, /definer-drift/],
    [{ volatility: "s" }, /volatility-drift/],
    [{ functionConfig: ["search_path=public"] }, /proconfig-drift/],
    [{ publicCreate: true }, /public-create-drift/],
    [{ applicationCreateViolationCount: 1 }, /application-create-drift/],
    [{ ownerOnlyExecute: false }, /execute-acl-drift/],
    [{ directDmlAllowed: true }, /direct-dml-drift/],
    [{ anomalyUpdateDeleteAllowed: true }, /anomaly-dml-drift/],
    [{ approvedCommandExecute: false }, /approved-execute-drift/],
    [{ rowSetExact: false }, /row-set-drift/],
    [{ factsExact: false }, /facts-drift/],
    [{ ephemeralLeak: true }, /ephemeral-leak/]
  ]) {
    assert.throws(() => validateSecurityFixture({ ...fixture, ...drift }), pattern);
  }
});

test("B0-SCHEMA-012 security v1 exact targets include anomaly authority", () => {
  const source = readFileSync(
    new URL("../track-b-schema-expand.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /fn_transition_property_migration_anomaly/);
  assert.match(source, /rows\.length !== 22/);
  assert.match(source, /kind: "anomaly-relation-security"/);
  assert.match(source, /"biz_property_migration_anomaly"/);
  assert.match(source, /"biz_property_migration_anomaly_audit"/);
  assert.match(source, /label: "anomaly-update"/);
  assert.match(source, /label: "anomaly-audit-delete"/);
});

test("B0-SCHEMA-013 cleanup and failure diagnostics remain bounded and fail closed", () => {
  const source = readFileSync(
    new URL("../track-b-schema-expand.mjs", import.meta.url),
    "utf8"
  );
  assert.match(source, /for \(let attempt = 0; attempt < 30; attempt \+= 1\)/);
  assert.match(source, /container cleanup timeout:/);
  assert.match(source, /anonymous volume cleanup timeout:/);
  assert.match(source, /function captureFailureDiagnostics\(\)/);
  assert.match(source, /\["logs", "--tail", "120", "--since", "5m", containerId\]/);
  assert.match(source, /failure diagnostic capture threw:/);
  assert.match(source, /assertScalar\(harness, "SELECT 1", 1, "final database liveness"\)/);
  assert.match(source, /000189 accepted occupancy route-token drift on rerun/);
  assert.match(source, /failure preserves occupancy route-token drift/);
  assert.match(source, /failure_diagnostics: failureDiagnostics/);
  assert.match(source, /final_liveness: finalLiveness/);
  assert.match(source, /requested_fresh_run_count: 1/);
  assert.match(source, /completed_fresh_run_count: 1/);
});

test("B0-SCHEMA-014 final readiness cannot observe the temporary init server", async () => {
  const calls = [];
  const logs = [
    "database system is ready to accept connections",
    "PostgreSQL init process complete; ready for start up."
  ];
  let readyAttempts = 0;
  await waitForFinalPostgres({
    readLogs: async () => {
      calls.push("logs");
      return logs.shift() ?? "";
    },
    probeReady: async () => {
      calls.push("ready");
      readyAttempts += 1;
      return readyAttempts === 2;
    },
    readState: async () => {
      calls.push("state");
      return { Running: true, Status: "running" };
    },
    delay: async () => {},
    maxAttempts: 3,
    intervalMilliseconds: 0
  });
  assert.deepEqual(calls, ["logs", "state", "logs", "state", "ready", "state", "ready"]);
  assert.equal(calls.indexOf("ready") > calls.lastIndexOf("logs"), true);
  await assert.rejects(
    () => waitForFinalPostgres({
      readLogs: async () => "temporary server only",
      probeReady: async () => true,
      readState: async () => ({ Running: true, Status: "running" }),
      delay: async () => {},
      maxAttempts: 2,
      intervalMilliseconds: 0
    }),
    /init-complete marker timeout: state=.*running.*logs=temporary server only/
  );
});

test("B0-SCHEMA-015 deterministic Gate stops after the first failed run", async () => {
  const calls = [];
  const failedRun = {
    status: "failed",
    schema: null,
    migrations: [],
    cleanup: {
      container_absent: true,
      anonymous_volume_absent: true,
      errors: []
    },
    error: "synthetic first-run failure"
  };
  const evidence = await runDeterminismGate(
    { PROPERTY_B_SCHEMA_RUN_ID: "b0failfaststatic" },
    3,
    async (environment) => {
      calls.push(environment.PROPERTY_B_SCHEMA_RUN_ID);
      return failedRun;
    }
  );
  assert.deepEqual(calls, ["b0failfaststaticr1"]);
  assert.equal(evidence.status, "failed");
  assert.equal(evidence.fresh_run_count, 3);
  assert.equal(evidence.requested_fresh_run_count, 3);
  assert.equal(evidence.completed_fresh_run_count, 1);
  assert.equal(evidence.runs.length, 1);
  assert.match(evidence.error, /passed=0\/3, completed=1\/3/);
});
