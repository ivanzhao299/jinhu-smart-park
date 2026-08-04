import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXED_AUTHORITIES,
  AUTHORITY_SIDECARS,
  MODULE_MIGRATIONS,
  MODULE_CORE_TEST_PREREQUISITE_SQL,
  captureInputFreeze,
  listModuleTree,
  parseTap,
  verifyFixedAuthorities
} from "./track-b-module-core-gate.mjs";
import {
  OFFICIAL_POSTGRES_IMAGE,
  buildEphemeralPostgresRunArgs
} from "./bootstrap/ephemeral-postgres.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const runner = readFileSync(resolve(root,
  "scripts/e2e/property-remediation/track-b-module-core-gate.mjs"), "utf8");
const pgSpec = readFileSync(resolve(root,
  "apps/api/src/saas-modules.module-core.pg.spec.ts"), "utf8");

test("freezes the approved module-core authority values", () => {
  assert.deepEqual(FIXED_AUTHORITIES, {
    b_contract_v2: "e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944",
    b_schema_expand: "53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874",
    b_high_risk_stopship: "d30c601729d83155fda96a0686043cd6fcc6f098368775d1ce73aa0983dfa9d8",
    runtime_effect_manifest: "47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf",
    migration_000189: "f4af3e88776ae16a0903b0a9a6a8453f674a7a8d317bdd56b5455dfc18e114a2"
  });
  assert.doesNotThrow(verifyFixedAuthorities);
  assert.deepEqual(Object.keys(AUTHORITY_SIDECARS), [
    "contract_locator",
    "contract_final_gate",
    "schema_handoff",
    "stopship_implementation_record",
    "stopship_independent_review_record"
  ]);
});

test("pins the exact 000184 through 000190 migration closure", () => {
  assert.deepEqual(MODULE_MIGRATIONS.map(([name]) => name), [
    "000184_property_workbench_read_permissions.sql",
    "000185_property_b_identity_schema_expand.sql",
    "000186_property_b_approval_runtime_schema.sql",
    "000187_property_b_event_notification_schema.sql",
    "000188_property_b_task_runtime_schema.sql",
    "000189_property_b_module_rbac_definitions.sql",
    "000190_property_b_migration_compatibility_control.sql"
  ]);
  assert.equal(new Set(MODULE_MIGRATIONS.map(([, sha]) => sha)).size, 7);
});

test("uses one deterministic test-only asset prerequisite without running seeds", () => {
  assert.match(MODULE_CORE_TEST_PREREQUISITE_SQL,
    /a5500000-0000-4000-8000-000000000001/u);
  assert.match(MODULE_CORE_TEST_PREREQUISITE_SQL, /'asset'/u);
  assert.match(MODULE_CORE_TEST_PREREQUISITE_SQL,
    /PR192 module-core test-only prerequisite/u);
  assert.doesNotMatch(runner, /database\/seeds|db:seed:prod|db:seed:dev/u);
  assert.match(runner, /test_prerequisite_gate: prerequisiteGate/u);
  assert.match(runner, /exact-set mismatch/u);
});

test("requires the exact 14-file module tree", () => {
  const files = listModuleTree();
  assert.equal(files.length, 14);
  assert.equal(files.filter((path) => path.endsWith(".spec.ts")).length, 1);
  assert.equal(files.filter((path) => !path.endsWith(".spec.ts")).length, 13);
});

test("input freeze is deterministic and includes execution authority", () => {
  const first = captureInputFreeze("first");
  const second = captureInputFreeze("second");
  assert.equal(first.raw_sha256, second.raw_sha256);
  const paths = first.files.map((file) => file.path);
  for (const required of [
    "apps/api/src/saas-modules.module-core.pg.spec.ts",
    "scripts/e2e/property-remediation/bootstrap/ephemeral-postgres.mjs",
    "scripts/e2e/property-remediation/track-b2a-c4-runtime-lifecycle.mjs",
    "database/migrations/000189_property_b_module_rbac_definitions.sql"
  ]) assert.ok(paths.includes(required), required);
});

test("Docker construction is official, loopback-random, auto-remove and double-labelled", () => {
  const args = buildEphemeralPostgresRunArgs({
    containerName: "pr192_b_module_core_static_run_1234_db",
    databaseName: "pr192_b_module_core",
    fixtureLabel: "pr192-b-module-core-gate",
    runId: "static_run_1234",
    postgresUser: "pr192_module_core",
    postgresPassword: "local-only"
  });
  assert.ok(args.includes("--rm"));
  assert.ok(args.includes("127.0.0.1::5432"));
  assert.equal(args.at(-1), OFFICIAL_POSTGRES_IMAGE);
  assert.equal(args.filter((value) => value === "--label").length, 2);
  assert.equal(args.some((value) => value === "--mount" || value === "--volume"), false);
});

test("runId authority is exclusive, permanent and mode 0600", () => {
  assert.match(runner, /\.b-module-core-runid-\$\{runIdDigest\}\.reservation\.json/u);
  assert.match(runner, /schema_version: "property-b-module-core-runid-reservation-v1"/u);
  assert.match(runner, /writeFileSync\(reservationPath, reservationBytes, \{ flag: "wx", mode: 0o600 \}\)/u);
  assert.match(runner, /module-core runId is permanently reserved/u);
});

test("runner performs the exact four immutable input freezes", () => {
  for (const phase of ["before-container", "after-local", "after-pg", "after-cleanup"]) {
    assert.match(runner, new RegExp(`"${phase}"`, "u"));
  }
  assert.match(runner, /module-core four-stage input drift/u);
});

test("cleanup can target only a revalidated exact container id and anonymous volume", () => {
  assert.match(runner, /cleanupExactLifecycle/u);
  assert.match(runner, /validateContainer: \(observed\) => validateExact\(observed, false, false\)/u);
  assert.match(runner, /removeContainer: \(id\) => docker\(\["rm", "-f", "-v", id\]\)/u);
  assert.match(runner, /removeVolume: \(name\) => docker\(\["volume", "rm", name\]\)/u);
  assert.doesNotMatch(runner, /docker\(\["rm", "-f", "-v", containerName\]/u);
});

test("candidate evidence cannot generate the final grammar or signoff", () => {
  assert.match(runner, /final_grammar_or_signoff_generated: false/u);
  assert.match(runner, /property-b-module-core-gate-candidate-v1/u);
  assert.doesNotMatch(runner, /b-module-core-v1\.grammar/u);
  assert.doesNotMatch(runner, /b-module-core-v1-signoff/u);
});

test("PG spec exercises real Nest service concurrency, scope, rollback and stable 409", () => {
  for (const fragment of [
    "NestFactory.createApplicationContext",
    "service.enableTenantModule",
    "service.disableTenantModule",
    "pg_advisory_xact_lock",
    "Promise.allSettled",
    "tenant/park isolation",
    "superuser actor",
    "module-core-forced-rollback",
    "module-dependency-conflict",
    "getStatus(), 409"
  ]) assert.ok(pgSpec.includes(fragment), fragment);
  assert.throws(() => parseTap("# tests 1\n# pass 0\n# fail 1\n# skipped 0\n", 1, "bad"));
});

test("runner executes targeted authority and reviewed 000175 rollback before PostgreSQL", () => {
  assert.match(runner, /saas-modules\.property-dependency\.spec\.ts/u);
  assert.match(runner, /const expectedTargetedTests = 4/u);
  assert.match(runner, /stage = "local-targeted-gate"/u);
  assert.match(runner, /targetedGate = parseTap/u);
  assert.match(runner, /targeted_gate: targetedGate/u);
  assert.ok(runner.indexOf('stage = "local-targeted-gate"')
    < runner.indexOf('stage = "postgres-start"'));
  assert.match(runner, /verifyReviewedMigration175Rollback/u);
  assert.match(runner, /const before175 = reviewed\.entries\.filter/u);
  assert.match(runner, /const after175 = reviewed\.entries\.filter/u);
  assert.match(runner, /reviewed_bootstrap_gate: bootstrapGate/u);
});

test("runner binds typecheck, build, lint and PostgreSQL environment evidence", () => {
  assert.match(runner, /stage = "local-quality-gate"/u);
  assert.match(runner, /"@jinhu\/api", "typecheck"/u);
  assert.match(runner, /"@jinhu\/api", "build"/u);
  assert.match(runner, /"pnpm", \["exec", "eslint"/u);
  assert.match(runner, /quality_gate: qualityGate/u);
  assert.match(runner, /docker\(\["image", "inspect", OFFICIAL_POSTGRES_IMAGE\]/u);
  assert.match(runner, /SHOW server_version/u);
  assert.match(runner, /environment: environmentEvidence/u);
  for (const path of [
    'resolve(apiRoot, "tsconfig.build.json")',
    'resolve(apiRoot, "nest-cli.json")',
    'resolve(root, "package.json")',
    'resolve(root, "eslint.config.mjs")',
    'resolve(root, "tsconfig.base.json")'
  ]) assert.ok(runner.includes(path), path);
});
