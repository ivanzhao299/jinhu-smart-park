import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migrationPath = resolve(
  root,
  "database/migrations/000189_property_b_module_rbac_definitions.sql"
);
const seedPath = resolve(
  root,
  "database/seeds/production/000006_property_track_b_permission_reconcile.sql"
);
const productionCoreSeedPath = resolve(root, "database/seeds/000001_s1_production_core.sql");
const leasingLeadRepairPath = resolve(
  root,
  "database/seeds/production/000009_jh_leasing_lead_workorder_create_repair.sql"
);
const identityOperatorDownloadMigrationPath = resolve(
  root,
  "database/migrations/000216_property_identity_operator_download_bundle.sql"
);
const propertyControlPlaneUatFixturePath = resolve(
  root,
  "scripts/e2e/property-control-plane-uat-fixture.mjs"
);
const ciWorkflowPath = resolve(root, ".github/workflows/ci.yml");
const migrationBuffer = readFileSync(migrationPath);
const migration = migrationBuffer.toString("utf8");
const seed = readFileSync(seedPath, "utf8");
const productionCoreSeed = readFileSync(productionCoreSeedPath, "utf8");
const leasingLeadRepair = readFileSync(leasingLeadRepairPath, "utf8");
const identityOperatorDownloadMigration = readFileSync(identityOperatorDownloadMigrationPath, "utf8");
const propertyControlPlaneUatFixture = readFileSync(propertyControlPlaneUatFixturePath, "utf8");
const ciWorkflow = readFileSync(ciWorkflowPath, "utf8");

assert.equal(
  createHash("sha256").update(migrationBuffer).digest("hex"),
  "f4af3e88776ae16a0903b0a9a6a8453f674a7a8d317bdd56b5455dfc18e114a2",
  "historical migration 000189 must remain byte-for-byte unchanged"
);

function extractValuesBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing SQL marker: ${startMarker}`);
  const values = source.indexOf("VALUES", start);
  assert.notEqual(values, -1, `missing VALUES after: ${startMarker}`);
  const end = source.indexOf(endMarker, values);
  assert.notEqual(end, -1, `missing SQL end marker: ${endMarker}`);
  return source.slice(values + "VALUES".length, end);
}

function parseSqlTuples(block) {
  const tuples = [];
  let tuple = null;
  let token = "";
  let depth = 0;
  let quoted = false;

  const pushToken = () => {
    const value = token.trim();
    assert.notEqual(value, "", "empty value in signed permission tuple");
    if (/^NULL$/i.test(value)) {
      tuple.push(null);
    } else if (/^(true|false)$/i.test(value)) {
      tuple.push(value.toLowerCase() === "true");
    } else if (/^-?\d+$/.test(value)) {
      tuple.push(Number(value));
    } else {
      assert.match(value, /^'(?:[^']|'')*'$/, `unsupported SQL literal: ${value}`);
      tuple.push(value.slice(1, -1).replaceAll("''", "'"));
    }
    token = "";
  };

  for (let index = 0; index < block.length; index += 1) {
    const character = block[index];
    if (quoted) {
      token += character;
      if (character === "'" && block[index + 1] === "'") {
        token += block[index + 1];
        index += 1;
      } else if (character === "'") {
        quoted = false;
      }
      continue;
    }
    if (character === "'") {
      quoted = true;
      token += character;
    } else if (character === "(") {
      if (depth === 0) {
        tuple = [];
      } else {
        token += character;
      }
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      assert.ok(depth >= 0, "unbalanced closing parenthesis in VALUES block");
      if (depth === 0) {
        pushToken();
        tuples.push(tuple);
        tuple = null;
      } else {
        token += character;
      }
    } else if (character === "," && depth === 1) {
      pushToken();
    } else if (depth > 0) {
      token += character;
    }
  }

  assert.equal(quoted, false, "unterminated SQL string in VALUES block");
  assert.equal(depth, 0, "unterminated SQL tuple in VALUES block");
  return tuples;
}

const migrationDefinitions = parseSqlTuples(
  extractValuesBlock(
    migration,
    "signed_permission(\n  code,name,resource,action,permission_type,perm_type,api_method,api_path,",
    "\n)\nINSERT INTO sys_permission"
  )
);
const seedDefinitions = parseSqlTuples(
  extractValuesBlock(
    seed,
    "INSERT INTO property_track_b_expected_definition (",
    ";\n\nUPDATE sys_permission"
  )
);

assert.equal(migrationDefinitions.length, 25, "000189 must retain 25 signed permission tuples");
assert.equal(seedDefinitions.length, 26, "post-seed reconcile must contain 26 permission tuples");
assert.equal(seedDefinitions[0]?.[0], "party:identity_reveal");
assert.deepEqual(
  seedDefinitions.slice(1),
  migrationDefinitions,
  "post-seed definitions after the F04 extension must exactly match the frozen 000189 signed tuples"
);

const parentCaseStart = productionCoreSeed.indexOf("parent.code = CASE");
const parentCaseEnd = productionCoreSeed.indexOf("\n      ELSE NULL\n    END", parentCaseStart);
assert.notEqual(parentCaseStart, -1, "production core seed must retain permission_parent_map CASE");
assert.notEqual(parentCaseEnd, -1, "production core permission_parent_map CASE must terminate");
const parentCase = productionCoreSeed.slice(parentCaseStart, parentCaseEnd);
const explicitAssetParentCodes = new Set();
for (const match of parentCase.matchAll(/WHEN child\.code IN \(([\s\S]*?)\) THEN 'asset'/g)) {
  for (const code of match[1].matchAll(/'([^']+)'/g)) {
    explicitAssetParentCodes.add(code[1]);
  }
}
for (const match of parentCase.matchAll(/WHEN child\.code = '([^']+)' THEN 'asset'/g)) {
  explicitAssetParentCodes.add(match[1]);
}

const trackBPageCodes = [
  "asset:identity-submissions:page",
  "asset:property-operations:page",
  "asset:property-occupancies:page",
  "asset:property-mode-transitions:page",
  "property:notifications:page",
  "property:event-delivery-incidents:page",
  "property:approval-incidents:page"
];
for (const pageCode of trackBPageCodes) {
  assert.ok(
    explicitAssetParentCodes.has(pageCode),
    `production core permission_parent_map must explicitly map ${pageCode} to asset`
  );
}
assert.equal(
  /child\.code LIKE 'asset:%'/.test(parentCase),
  false,
  "Track B asset page parenting must not use a generic asset wildcard"
);
assert.equal(
  /child\.code LIKE 'property:%'/.test(parentCase),
  false,
  "Track B property page parenting must not use a generic property wildcard"
);

for (const preflightToken of [
  "property-track-b-seed-scope-preflight-failed",
  "tenant_count <> 1",
  "park_count < 1",
  "JOIN biz_park park",
  "park.status = 1",
  "asset_assignment_count <> 1",
  "asset_parent_count <> 1",
  "super_admin_count <> 1",
  "assignment.enabled = true",
  "assignment.status = 'enabled'",
  "assignment.is_deleted = false",
  "role.code = 'SUPER_ADMIN'",
  "role.is_system = true",
  "role.is_builtin = true",
  "role.is_super = true"
]) {
  assert.ok(seed.includes(preflightToken), `missing fail-closed scope preflight: ${preflightToken}`);
}
assert.equal(
  seed.includes("asset_park"),
  false,
  "post-seed scope must use the production-core canonical biz_park table"
);

assert.match(
  identityOperatorDownloadMigration,
  /role\.applied_bundle_codes \? 'property-bundle:property-identity-operator'/,
  "identity operator download backfill must require bundle provenance"
);
assert.equal(
  identityOperatorDownloadMigration.includes("unnest(ARRAY["),
  false,
  "identity operator download backfill must not infer bundle membership from an arbitrary permission superset"
);
assert.match(
  identityOperatorDownloadMigration,
  /predecessor_hash varchar\(64\) := '6c7797a89b6246970a5822aa25959091b60bcab719a428d6fde053df2e73db42'/,
  "identity operator download migration must pin the exact released predecessor bundle hash"
);
assert.match(
  identityOperatorDownloadMigration,
  /property-identity-operator-bundle-predecessor-drift/,
  "identity operator download migration must fail closed on predecessor drift"
);
assert.match(
  identityOperatorDownloadMigration,
  /lpad\(member\.member_ordinal::text, 4, '0'\) \|\| chr\(9\)[\s\S]*?\|\| member\.permission_code \|\| chr\(10\)/,
  "identity operator download migration must use the canonical bundle hash serialization"
);
assert.doesNotMatch(
  identityOperatorDownloadMigration,
  /role\.is_enabled = true[\s\S]*?role\.applied_bundle_codes \? 'property-bundle:property-identity-operator'/,
  "identity operator download backfill must include disabled non-deleted bundle-derived roles"
);
assert.doesNotMatch(
  identityOperatorDownloadMigration,
  /role\.status = 'enabled'[\s\S]*?role\.applied_bundle_codes \? 'property-bundle:property-identity-operator'/,
  "identity operator download backfill must not exclude disabled bundle-derived roles by status"
);
assert.match(
  identityOperatorDownloadMigration,
  /string_agg\([\s\S]*?bundle\.bundle_code \|\| '@' \|\| bundle\.definition_version::text \|\| ':' \|\| bundle\.definition_hash,[\s\S]*?chr\(10\) ORDER BY bundle\.bundle_code/,
  "identity operator download migration must recompute role applied-bundle signatures with service-compatible serialization"
);
assert.match(
  identityOperatorDownloadMigration,
  /role\.applied_bundle_codes \? bundle\.bundle_code[\s\S]*?UPDATE public\.sys_role role[\s\S]*?SET applied_bundle_signature = role_bundle_signatures\.signature/,
  "identity operator download migration must refresh affected role bundle provenance"
);
assert.match(
  identityOperatorDownloadMigration,
  /property-identity-operator-file-download-permission-unresolved/,
  "identity operator download migration must fail when affected tenants cannot resolve file:download"
);
assert.match(
  identityOperatorDownloadMigration,
  /permission_count <> 1/,
  "identity operator download migration must require exactly one active file:download permission per affected tenant"
);

for (const fixtureScopeToken of [
  "isProductionLikeTarget",
  "PROPERTY_CONTROL_PLANE_UAT_TARGET",
  "disposableTargetMarkers",
  "productionEnvNames",
  "targetUrls",
  "Refusing to write property control-plane UAT fixtures without PROPERTY_CONTROL_PLANE_UAT_TARGET=local|disposable|ci|test on a local database target.",
  "assertUatScopePreflight",
  "active_park_count",
  "active_asset_assignment_count",
  "FROM biz_park park",
  "park.park_id=$2",
  "park.status=1",
  "module.module_code='asset'",
  "assignment.enabled=true",
  "assignment.status='enabled'",
  "assignment.is_deleted=false",
  "assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp()",
  "assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp()",
  "biz_party_identity_verification_queue",
  "identityQueuePolicySnapshot",
  "identityVerifierRequiredPermissions",
  "identityQueueCode",
  "ORDER BY queue_code ASC, id ASC",
  "is not the first active non-legacy queue",
  "eligibleVerifierUserIds",
  "queueSupervisorUserIds",
  "party:identity_verify",
  "party:read",
  "file:download",
  "IDENTITY_VERIFIER_USERNAME"
]) {
  assert.ok(
    propertyControlPlaneUatFixture.includes(fixtureScopeToken),
    `property control-plane UAT fixture missing active scope preflight: ${fixtureScopeToken}`
  );
}
assert.doesNotMatch(
  propertyControlPlaneUatFixture,
  /localPostgresHosts[\s\S]*"postgres"/,
  "property control-plane UAT fixture must not classify the production Docker postgres alias as local-safe"
);
assert.ok(
  propertyControlPlaneUatFixture.indexOf('await client.query("BEGIN")')
    < propertyControlPlaneUatFixture.indexOf("INSERT INTO biz_party_identity_verification_queue"),
  "property control-plane UAT fixture must provision the identity queue inside the rollback boundary"
);
for (const selectorToken of [
  "current_park.tenant_id=actor.tenant_id",
  "current_park.park_id=actor.park_id",
  "current_park.tenant_id=verifier.tenant_id",
  "current_park.park_id=verifier.park_id"
]) {
  assert.ok(
    propertyControlPlaneUatFixture.includes(selectorToken),
    `property control-plane UAT actor selector missing active park predicate: ${selectorToken}`
  );
}
for (const permissionCode of [
  "asset:property-operations:page",
  "property_operation:read",
  "property_operation:update",
  "property_operation:transition_mode",
  "asset:property-occupancies:page",
  "property_occupancy:read",
  "property_occupancy:create",
  "property_occupancy:activate",
  "property_occupancy:release",
  "property_occupancy:force_release",
  "asset:property-mode-transitions:page",
  "property_approval:create",
  "property_approval:read",
  "property_approval:withdraw"
]) {
  assert.ok(
    propertyControlPlaneUatFixture.includes(permissionCode),
    `property control-plane UAT fixture actor missing control-plane permission: ${permissionCode}`
  );
}
assert.match(
  propertyControlPlaneUatFixture,
  /FROM unnest\(\$4::varchar\[\]\) required\(code\)/,
  "property control-plane UAT fixture actor check must use the full required permission array"
);
assert.match(
  propertyControlPlaneUatFixture,
  /immutableOccupancyActivity[\s\S]*?biz_property_occupancy[\s\S]*?status !== "held"[\s\S]*?version[\s\S]*?Fixture occupancy has activation or release activity/,
  "property control-plane UAT fixture reruns must fail closed after occupancy activation or release activity"
);
assert.match(
  propertyControlPlaneUatFixture,
  /JOIN rel_role_data_scope role_scope[\s\S]*?JOIN sys_data_scope_rule data_rule[\s\S]*?data_rule\.dimension IN \('tenant','park'\)[\s\S]*?data_rule\.scope_type IN \('all','tenant','park'\)/,
  "property control-plane UAT fixture actor must have unrestricted unit data scope unless super"
);

assert.equal(
  (seed.match(/permission\.permission_type = 'page'/g) ?? []).length >= 3,
  true,
  "post-seed insert, convergence and drift guard must use page-visible semantics"
);
assert.equal(
  seed.includes("permission.permission_type IN ('page','api')"),
  true,
  "post-seed visibility convergence must cover only Track B page and API definitions"
);

assert.match(
  seed,
  /UPDATE sys_permission permission[\s\S]*?permission\.code = 'property_occupancy:force_release'[\s\S]*?api_path IS DISTINCT FROM '\/api\/v1\/property\/occupancies\/:occupancyId\/release';/
);
assert.match(
  seed,
  /ON CONFLICT \(tenant_id, code\) WHERE is_deleted = false DO NOTHING;/,
  "permission reconciliation must be insert-only and conflict-safe"
);
assert.equal(
  /INSERT INTO sys_permission[\s\S]*?ON CONFLICT[\s\S]*?DO UPDATE/i.test(seed),
  false,
  "Track B permissions must never be overwritten by an upsert"
);

for (const driftToken of [
  "property-track-b-seed-permission-definition-drift",
  "(SELECT * FROM expected EXCEPT SELECT * FROM actual)",
  "(SELECT * FROM actual EXCEPT SELECT * FROM expected)",
  "permission.component_key",
  "permission.data_dimension",
  "permission.is_tenant_custom",
  "permission.always_show",
  "permission.version",
  "permission.remark"
]) {
  assert.ok(seed.includes(driftToken), `missing all-field drift guard: ${driftToken}`);
}

assert.match(seed, /INSERT INTO rel_role_perm[\s\S]*?role\.code = 'SUPER_ADMIN'/);
assert.equal(
  /role\.code\s+IN\s*\(/i.test(seed),
  false,
  "post-seed reconcile must not grant Track B permissions to a role set"
);
assert.equal(
  /role\.code\s*=\s*'(?!SUPER_ADMIN)[^']+'/i.test(seed),
  false,
  "post-seed reconcile must not grant Track B permissions to another role"
);

for (const assertionToken of [
  "permission_count <> 26",
  "super_admin_grant_count <> 26",
  "bundle_count <> 16",
  "bundle_member_count <> 131",
  "bundle_permission_count <> 57",
  "resolved_bundle_permission_count <> 57"
]) {
  assert.ok(seed.includes(assertionToken), `missing post-seed cardinality assertion: ${assertionToken}`);
}

const writes = [
  ...seed.matchAll(/^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/gim)
].map((match) => `${match[1].toUpperCase()} ${match[2]}`);
assert.deepEqual(writes, [
  "INSERT INTO property_track_b_seed_scope",
  "INSERT INTO property_track_b_expected_definition",
  "UPDATE sys_permission",
  "INSERT INTO sys_permission",
  "UPDATE sys_permission",
  "INSERT INTO rel_role_perm"
]);

for (const forbiddenWriteTarget of [
  "sys_role",
  "sys_user",
  "sys_tenant",
  "asset_park",
  "rel_tenant_module",
  "rel_plan_module",
  "sys_module",
  "sys_property_permission_bundle",
  "rel_property_permission_bundle_member"
]) {
  assert.equal(
    new RegExp(`(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+${forbiddenWriteTarget}`, "i").test(seed),
    false,
    `post-seed reconcile must not write ${forbiddenWriteTarget}`
  );
}

for (const repairToken of [
  "BEGIN;",
  "LOCK TABLE rel_role_perm IN SHARE ROW EXCLUSIVE MODE;",
  "VALUES ('INVEST_MANAGER'), ('JH_LEASING_LEAD')",
  "permission.code = 'workorder:create'",
  "total_count NOT IN (0, 1)",
  "active_count <> total_count",
  "invalid_role_count <> 0",
  "permission_count <> 1",
  "INSERT INTO rel_role_perm",
  "WHERE scope.role_id IS NOT NULL",
  "grant_count <> expected_count",
  "COMMIT;"
]) {
  assert.ok(leasingLeadRepair.includes(repairToken), `missing leasing-lead repair contract: ${repairToken}`);
}
assert.equal(
  /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:sys_role|sys_user|sys_permission)/i.test(
    leasingLeadRepair
  ),
  false,
  "leasing-lead repair must only bind an existing role to an existing permission"
);
assert.match(
  leasingLeadRepair,
  /INSERT INTO jh_leasing_lead_expected_role \(role_code\)\s*VALUES \('INVEST_MANAGER'\), \('JH_LEASING_LEAD'\);/,
  "leasing-lead repair must keep the reviewed two-role alias set exact"
);

assert.match(
  ciWorkflow,
  /defaults:\s*\n\s+run:\s*\n\s+shell: bash --noprofile --norc -eo pipefail \{0\}/,
  "CI run steps must globally preserve the producer exit status for tee pipelines"
);

console.log("[PASS] property Track B post-seed reconcile contract");
