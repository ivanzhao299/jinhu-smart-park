import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(__dirname, "../../../../..");
const researchRoot = resolve(
  repositoryRoot,
  ".trellis/tasks/07-30-pr192-property-productization-remediation/research"
);
const migrationRoot = resolve(repositoryRoot, "database/migrations");

const frozenInputs = [
  ["b0-runtime-contract-freeze.md", "47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf"],
  ["b0-product-access-freeze.md", "d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040"],
  ["b0-identity-control-freeze.md", "062ba02b310e00a7fb43e3288e1cd78c55f23d30518e8aeac006eae8b7ea9496"],
  ["b0-schema-physical-addendum.md", "3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5"]
] as const;

const migrations = [
  "000185_property_b_identity_schema_expand.sql",
  "000186_property_b_approval_runtime_schema.sql",
  "000187_property_b_event_notification_schema.sql",
  "000188_property_b_task_runtime_schema.sql",
  "000189_property_b_module_rbac_definitions.sql",
  "000200_property_b_migration_compatibility_control.sql"
] as const;

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("B-0 four-input contract digest is exact and non-circular", () => {
  const rows = frozenInputs.map(([filename, expected]) => {
    const bytes = readFileSync(resolve(researchRoot, filename));
    assert.equal(sha256(bytes), expected, filename);
    assert.equal(bytes.includes(Buffer.from("\r")), false, `${filename} must be LF-only`);
    assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
    return `freeze\t${filename}\t${expected}\n`;
  });
  const manifestBytes = `b-contract-v2\n${rows.join("")}`;
  assert.equal(Buffer.byteLength(manifestBytes), 421);
  assert.equal(
    sha256(manifestBytes),
    "e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944"
  );
});

test("B-0 shared precondition freezes the 49-row endpoint authority", () => {
  const contracts = readFileSync(
    resolve(repositoryRoot, "packages/shared/src/property-business/track-b-contracts.ts"),
    "utf8"
  );
  const endpoints = readFileSync(
    resolve(
      repositoryRoot,
      "packages/shared/src/property-business/track-b-endpoint-permissions.ts"
    ),
    "utf8"
  );
  assert.match(
    contracts,
    /TRACK_B_CONTRACT_SHA256\s*=\s*\n?\s*"e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944"/
  );
  assert.equal(endpoints.match(/\brow\("/g)?.length, 49);
  assert.equal(endpoints.match(/^\s*row\("(?:GET|POST|PUT)"/gm)?.length, 49);
  assert.match(
    endpoints,
    /PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST_SHA256\s*=\s*\n?\s*"6b82b875f432d4e1d1efc01ce32b958b4a8b193e764862b7886b710bb0ded2fd"/
  );
});

test("B-0 migrations have the exact transaction and catalog-marker contract", () => {
  for (const filename of migrations) {
    const sql = readFileSync(resolve(migrationRoot, filename), "utf8");
    assert.match(sql, /^BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';/);
    assert.match(sql, /\nCOMMIT;\s*$/);
    assert.doesNotMatch(sql, /CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i);
    assert.doesNotMatch(sql, /\b(?:TRUNCATE|DROP\s+(?:TABLE|COLUMN|CONSTRAINT))\b/i);
    assert.match(
      sql,
      /^-- B0_CATALOG_OBJECT (?:table|column|constraint|index|function|trigger)\tpublic\.[^\r\n]+$/m,
      `${filename} must declare its catalog target objects`
    );
  }
});

test("B-0 expand migrations cannot grant roles, seed fixtures, or enable controls", () => {
  const sql = migrations
    .map((filename) => readFileSync(resolve(migrationRoot, filename), "utf8"))
    .join("\n");
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\s+(?:public\.)?rel_role_perm\b/i);
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\s+(?:public\.)?rel_user_role\b/i);
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\s+(?:public\.)?rel_tenant_module\b/i);
  assert.doesNotMatch(sql, /\b(?:test fixture|demo data)\b/i);
  assert.doesNotMatch(sql, /\btrue\s*,\s*'(?:observe|shadow|enforce)'/i);
});

test("B-0 schema preserves the frozen identity, approval, task and delivery states", () => {
  const identity = readFileSync(resolve(migrationRoot, migrations[0]), "utf8");
  const approval = readFileSync(resolve(migrationRoot, migrations[1]), "utf8");
  const event = readFileSync(resolve(migrationRoot, migrations[2]), "utf8");
  const task = readFileSync(resolve(migrationRoot, migrations[3]), "utf8");

  for (const status of [
    "draft", "pending_verification", "verified", "rejected", "withdrawn", "superseded"
  ]) assert.match(identity, new RegExp(`'${status}'`));
  for (const status of [
    "not_started", "executing", "retry_wait", "executed",
    "execution_failed", "infra_exhausted", "not_required"
  ]) assert.match(approval, new RegExp(`'${status}'`));
  for (const status of [
    "open", "claimed", "in_progress", "blocked", "closed", "cancelled"
  ]) assert.match(task, new RegExp(`'${status}'`));
  for (const status of [
    "pending", "delivering", "delivered", "delivery_failed", "delivery_exhausted"
  ]) assert.match(event, new RegExp(`'${status}'`));
});

test("000185 declares the exact identity command, guard and consistency surface", () => {
  const identity = readFileSync(resolve(migrationRoot, migrations[0]), "utf8");
  const functions = [
    "fn_party_identity_create_draft_cas",
    "fn_party_identity_update_draft_cas",
    "fn_party_identity_submit_cas",
    "fn_party_identity_withdraw_cas",
    "fn_party_identity_assignment_cas",
    "fn_party_identity_decision_cas",
    "fn_guard_party_identity_assignment_audit_insert",
    "fn_guard_party_identity_decision_insert",
    "fn_guard_party_identity_draft_file_mutation",
    "fn_validate_party_identity_consistency"
  ];
  const immediateTriggers = [
    "trg_biz_party_identity_assignment_audit_insert_guard",
    "trg_biz_party_identity_decision_insert_guard",
    "trg_rel_party_identity_draft_file_mutation_guard"
  ];
  const constraintTriggers = [
    "trg_biz_party_identity_party_consistency",
    "trg_biz_party_identity_submission_consistency",
    "trg_biz_party_identity_assignment_consistency",
    "trg_biz_party_identity_decision_consistency"
  ];
  const functionMarkers = identity.match(/^-- B0_CATALOG_OBJECT function\tpublic\.[^\r\n]+$/gm) ?? [];
  const triggerMarkers = identity.match(/^-- B0_CATALOG_OBJECT trigger\tpublic\.[^\r\n]+$/gm) ?? [];
  assert.equal(functionMarkers.filter((row) =>
    functions.some((name) => row.includes(`public.${name}(`))
  ).length, 10);
  assert.equal(triggerMarkers.filter((row) =>
    [...immediateTriggers, ...constraintTriggers].some((name) => row.endsWith(`.${name}`))
  ).length, 7);
  for (const name of functions) {
    assert.match(identity, new RegExp(`^-- B0_CATALOG_OBJECT function\\tpublic\\.${name}\\(`, "m"));
  }
  for (const name of immediateTriggers) {
    assert.match(identity, new RegExp(`^-- B0_CATALOG_OBJECT trigger\\tpublic\\.[^\\r\\n]+\\.${name}$`, "m"));
  }
  for (const name of constraintTriggers) {
    assert.match(identity, new RegExp(`^-- B0_CATALOG_OBJECT trigger\\tpublic\\.[^\\r\\n]+\\.${name}$`, "m"));
  }
});

test("B-schema catalog v2 uses validated business scope identifiers", () => {
  const gate = readFileSync(
    resolve(repositoryRoot, "scripts/e2e/property-remediation/track-b-schema-expand.mjs"),
    "utf8"
  );
  assert.match(gate, /B_SCHEMA_CATALOG_GRAMMAR = "b0-schema-catalog-v2"/);
  assert.match(gate, /B_SCHEMA_SECURITY_GRAMMAR = "b0-schema-security-v1"/);
  assert.match(gate, /B_SCHEMA_MANIFEST_GRAMMAR = "b0-schema-expand-v2"/);
  assert.match(gate, /CREATE TEMP TABLE b0_scope_canonical/);
  assert.match(gate, /CREATE TEMP TABLE b0_permission_scope_canonical/);
  assert.match(gate, /JOIN b0_permission_scope_canonical permission_scope/);
  assert.match(gate, /'tenantId',canonical_scope\.tenant_key/);
  assert.match(gate, /'parkId',canonical_scope\.park_key/);
  assert.match(gate, /signed 25 permission bidirectional exact-set/);
  assert.match(gate, /signed 12 control bidirectional exact-set/);
  assert.match(gate, /definition business scope exact-one mapping/);
  assert.match(gate, /catalog canonical definition target duplicate/);
  assert.match(gate, /catalog canonical name duplicate across kinds/);
  assert.match(gate, /schema manifest requires a signed security artifact SHA/);
  assert.match(gate, /kind: "anomaly-relation-security"/);
  assert.match(gate, /rows\.length !== 22/);
  assert.doesNotMatch(
    gate,
    /'definition\.permission\.'\|\|lower\(p\.tenant_id::text\)/
  );
});

test("000189/000190 freeze exact definitions and zero-grant/default-disabled policy", () => {
  const definitions = readFileSync(resolve(migrationRoot, migrations[4]), "utf8");
  const controls = readFileSync(resolve(migrationRoot, migrations[5]), "utf8");
  assert.match(definitions, /VALUES \('homestay', 'asset'\), \('housing_rental', 'asset'\)/);
  assert.match(definitions, /property_approval:read_incident/);
  assert.match(definitions, /property:event-delivery-incidents:page/);
  assert.match(definitions, /property:approval-incidents:page/);
  assert.match(definitions, /property-bundle:property-approval-incident-operator/);
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
  assert.match(controls, /a16f36bcd581afce9858c0b85ddded977a47d1979aa69a9763dad3db4bff58d8/);
  assert.match(controls, /false,\s*'disabled',\s*NULL,\s*NULL,\s*NULL,\s*'expand-only'/);
  assert.match(controls, /REVOKE ALL ON FUNCTION public\.fn_transition_property_migration_anomaly/);
});
