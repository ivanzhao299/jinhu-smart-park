import { Buffer } from "node:buffer";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashCanonical, sha256 } from "../lib/canonical.mjs";
import { generatorSha256, LOGICAL_TABLES } from "../lib/sql-fixture.mjs";
import { TABLE_ORDER, computeProfileChecksum, loadProfile } from "../lib/profile.mjs";
import {
  EXPECTED_MUTATIONS_PATH,
  EXTENSION_PROFILE_PATH,
  EXTENSION_TABLES,
  EXTENSION_TABLE_ORDER,
  extensionRows,
  fixtureSourceSha256,
  loadExpectedMutations,
  loadExtensionProfile
} from "./fixture.mjs";

const A_HANDOFF_PATH = resolve(
  "artifacts/property-remediation/runs/abase20260730final32ccc01/handoff.json"
);

export const AUTHORITIES = Object.freeze({
  a_profile_raw: "40664bc52b11c09098192877152476ab8456375170efdb636fa22b9a54cf5ce0",
  a_profile_checksum: "68daec8fb6fe73a413749a8a0181780c7462d35ff8e684fbaefaba0ed41b107b",
  a_generator: "35c032ac9dcf12bffe7cd85067c8d602f19e5901d6b8ab0fd97949011766c563",
  a_schema_raw: "9c965dd4984364fb7720faeaef60aa8c7f5620cdd7598f193b2c386f040908ae",
  a_handoff: "3cb78fe3b7d1d69490bc028f4da460d2fe4d0673f9eb7e13f6a6f47de10eb87c",
  a_source_commit: "32ccc02852c3201c6f68e3b6b89e4398cb102a17",
  b_contract_v2: "e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944",
  b_schema_expand: "53e568d409420dc6c38a8139a553735083502f05d6aeb2f3e14adcbb95276874",
  b_property_foundation_runtime: "984fcc8d0ceeeb536fd4df91728c8d275c0f4237b99cc074833f9dec54d963b4",
  b_approval_runtime: "30168511b4ea2028afebf45300a399dcb3f0d15b6ed279368611447a61f1f589",
  b_property_task_runtime: "f6d6f302cf14078bff54eb241d62763155a279ce272de2461b2de84b9df17645",
  b_module_core: "988eb7e5f70bc5e0614e700feaf77ea68d0edc1f1edcb90aa57ab5b4a3b193df",
  b2a_combined: "e61f39d936ef4a9b968beec645a09f2459419072d2b7c70067b71d7c2cbcc633"
});

const AUTHORITY_FILES = Object.freeze([
  ["artifacts/property-remediation/runs/abase20260730final32ccc01/handoff.json", "6969acf5ab6ab0194b0700a6adbb3af532ecb140e0dcd417264a29a680c1dc0f"],
  ["scripts/e2e/property-remediation/profiles/a-base-v1.json", AUTHORITIES.a_profile_raw],
  ["scripts/e2e/property-remediation/contracts/a-base-contract.schema.json", AUTHORITIES.a_schema_raw],
  [".trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-identity-control-freeze.md", "062ba02b310e00a7fb43e3288e1cd78c55f23d30518e8aeac006eae8b7ea9496"],
  [".trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-product-access-freeze.md", "d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040"],
  [".trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-runtime-contract-freeze.md", "47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf"],
  [".trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-schema-physical-addendum.md", "3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5"],
  [".trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-contract-freeze-current.md", "671ebcc86c9c49a6f6f9dbf2818ee1646c3a814a4b3d3329cfa09bbb6f705f10"],
  [".trellis/tasks/07-30-pr192-property-productization-remediation/research/b0-schema-final-gate.md", "ce1b32bf9c83e60f7031027a687bdbb8598c5876128eeb1986dc823742f6c6df"],
  [".trellis/tasks/07-30-pr192-property-productization-remediation/review-gates.md", "7f3bf48bde42266641dc9f8c2c1ac3f4afb47524b62a43d62d29d3d0b4bcae09"],
  [".trellis/tasks/07-30-pr192-property-productization-remediation/implement.md", "9fa03904f4b12c562a24991154f7a28d601151e0df432d00657518e100f31058"],
  [".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/ar1-schema-handoff-final.json", "24c29bc464c31962ac3012a23841beecba10f18e4cf4191b05d7adc367c3ec1d"],
  [".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c1-5-final-gate.md", "06733bc1a4a4fe44b592b5f6a7beb2d019ea2804691a2f160cd97b7ee5e5ca87"],
  [".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b-property-foundation-runtime-v2.txt", AUTHORITIES.b_property_foundation_runtime],
  [".trellis/tasks/07-30-pr192-b-identity-control-plane/research/b-property-foundation-contract-v2-attestation.txt", "8ee9ae99efbb14dd346ff10b78ed5af759c893b5f83d3d30188549f85e28807e"],
  [".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b-approval-runtime-v2.txt", AUTHORITIES.b_approval_runtime],
  [".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-c3-final-gate-signoff.md", "efed9823bfa6086319447c69068a744231a3a2b793997cfd887e0b318107b27d"],
  [".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b-property-task-runtime-v1.grammar", AUTHORITIES.b_property_task_runtime],
  [".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b-property-task-runtime-v1-handoff-signoff.md", "b3b14ba493e4acc142daf1588b6d28bcb5de9ce9ac0dc71d3a084fd9e88740c1"],
  [".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/c4-runtime-formal-final-signoff-v13l.md", "42ceac995d29f87dc4fdbabaca188ef602136d55d937a37699b39eabf15814db"],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b-module-core-v1.grammar", AUTHORITIES.b_module_core],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b-module-core-v1-handoff-signoff.md", "4556e3738f1eca9d6d807a81dc4f2d92e9a533ef5e013aebeb2a32e8da717fe4"],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2b-lease-reclaim-scenario-superseding-addendum.md", "84021fb9c295ae19b8b4221d54d4b21fcf355cdb59d8a4a6bce378c875299bee"],
  [".trellis/tasks/07-30-pr192-b-domain-integrations/research/b2b-lease-reclaim-scenario-addendum-signoff.md", "270ab6b37eacbb652715c0ca608a6c7215554b6faadeea5d111ef372d16b3bcb"],
  [".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/b2a-combined-final-signoff-superseding-20260801c.md", AUTHORITIES.b2a_combined],
  ["database/migrations/000184_property_workbench_read_permissions.sql", "fe6c5339d02985a411b19f99513766af616ff6a1b1119f7ad83a8fceef40b035"],
  ["database/migrations/000185_property_b_identity_schema_expand.sql", "3191ef37395a13ce513283e73994fc6949798dde8fc9666f586c9aeb4c3312ec"],
  ["database/migrations/000186_property_b_approval_runtime_schema.sql", "5b7778888668842eac38bc4e3bc6bb56320aecedf5f02e0fbf3f13928a7a0b9e"],
  ["database/migrations/000187_property_b_event_notification_schema.sql", "85dbd8235a538ed243a613ae9a12d6bddaba34f88687296c1ad02d3df9504c20"],
  ["database/migrations/000188_property_b_task_runtime_schema.sql", "e0b659d9d5c35eec67cfa029240538626492736e4f450f2b47acb40e25dc4e08"],
  ["database/migrations/000189_property_b_module_rbac_definitions.sql", "f4af3e88776ae16a0903b0a9a6a8453f674a7a8d317bdd56b5455dfc18e114a2"],
  ["database/migrations/000190_property_b_migration_compatibility_control.sql", "da633165db9a031d2a981a2d20f26a2fd78920b91be7722044b06bc9a7385c3a"],
  ["database/migrations/000193_property_b_runtime_integrity_forward_fix.sql", "c769efe549385f74092114cdf5f68c8ea40d78885bfecd484ed5a379f9c67f07"],
  ["database/migrations/000194_property_task_projection_contract_correction.sql", "93d99ac7b610df7aada4b57ba2c8ea1989aa40826910eedf4117ddcd39cc10f0"],
  ["database/migrations/000195_property_mutation_receipt_contract_v2.sql", "9b89f6dbfdec8cfcaa278dffb58677f8b9ccd3032f30f0f264155b6c656198f4"]
]);

const EXECUTED_SPEC_FILES = Object.freeze([
  "apps/api/src/modules/property-approvals/property-approval.decision.spec.ts",
  "apps/api/src/modules/property-tasks/property-task.orchestrator.spec.ts",
  "apps/api/src/modules/property-approvals/outbox/property-event-runtime.pg.spec.ts",
  "apps/api/src/modules/property-approvals/outbox/property-event-runtime.c2-v11.pg.spec.ts",
  "apps/api/src/modules/property-tasks/property-task.runtime.pg.spec.ts",
  "apps/api/src/modules/property-approvals/outbox/property-event-runtime.repository.spec.ts"
]);

const RUNTIME_IMPLEMENTATION_FILES = Object.freeze([
  "apps/api/src/modules/property-approvals/outbox/property-event-runtime.repository.ts",
  "apps/api/src/modules/property-approvals/property-approval.repository.ts",
  "apps/api/src/modules/property-approvals/entities/property-approval.entities.ts"
]);

function assertRegular(path) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`B-extension authority must be a regular file:${path}`);
  }
}

function validateABaseHandoff() {
  assertRegular(A_HANDOFF_PATH);
  const handoff = JSON.parse(readFileSync(A_HANDOFF_PATH, "utf8"));
  const embedded = handoff.canonical_sha256;
  delete handoff.canonical_sha256;
  const observed = hashCanonical(handoff);
  if (embedded !== AUTHORITIES.a_handoff || observed !== AUTHORITIES.a_handoff
    || handoff.profile_checksum !== AUTHORITIES.a_profile_checksum
    || handoff.generator_sha256 !== AUTHORITIES.a_generator
    || handoff.contract_sha256 !== AUTHORITIES.a_profile_raw
    || handoff.schema_sha256 !== AUTHORITIES.a_schema_raw
    || handoff.current_commit !== AUTHORITIES.a_source_commit
    || handoff.residual_count !== 0 || handoff.track_b_dependency_count !== 0) {
    throw new Error("A-base canonical handoff authority drift");
  }
  const profile = loadProfile();
  if (computeProfileChecksum(profile) !== AUTHORITIES.a_profile_checksum
    || generatorSha256() !== AUTHORITIES.a_generator) {
    throw new Error("A-base profile or generator checksum drift");
  }
  return { path: A_HANDOFF_PATH, canonical_sha256: observed };
}

export function freezeAuthoritativeInputs(stage = "before-write") {
  if (existsSync(resolve("database/migrations/000191_property_b_homestay_effect_schema.sql"))
    || existsSync(resolve("database/migrations/000192_property_b_housing_effect_schema.sql"))) {
    throw new Error("B-extension core requires reserved 000191/000192 to remain absent");
  }
  const aHandoff = validateABaseHandoff();
  const files = AUTHORITY_FILES.map(([relativePath, expected]) => {
    const path = resolve(relativePath);
    assertRegular(path);
    const bytes = readFileSync(path);
    const observed = sha256(bytes);
    if (observed !== expected) {
      throw new Error(`B-extension authority drift:${relativePath}:${expected}:${observed}`);
    }
    return { path: relativePath, bytes: bytes.length, raw_sha256: observed };
  });
  for (const path of [EXTENSION_PROFILE_PATH, EXPECTED_MUTATIONS_PATH,
    fileURLToPath(import.meta.url),
    resolve("scripts/e2e/property-remediation/b-extension/fixture.mjs"),
    resolve("scripts/e2e/property-remediation/b-extension/runner.mjs"),
    resolve("scripts/e2e/property-remediation/b-extension/runner.spec.mjs"),
    resolve("scripts/e2e/property-remediation/track-b-module-core-gate.mjs")]) {
    assertRegular(path);
    const bytes = readFileSync(path);
    files.push({ path: path.startsWith("/") ? path.slice(resolve(".").length + 1) : path,
      bytes: bytes.length, raw_sha256: sha256(bytes) });
  }
  for (const relativePath of [...EXECUTED_SPEC_FILES, ...RUNTIME_IMPLEMENTATION_FILES]) {
    const path = resolve(relativePath);
    assertRegular(path);
    const bytes = readFileSync(path);
    files.push({ path: relativePath, bytes: bytes.length, raw_sha256: sha256(bytes) });
  }
  files.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
  const grammar = `property-remediation-b-extension-authority-freeze-v1\n${Object.entries(AUTHORITIES)
    .map(([key, value]) => `authority\t${key}\t${value}\n`).join("")}${files.map((file) =>
    `${file.path}\t${file.bytes}\t${file.raw_sha256}\n`).join("")}`;
  return { stage, authorities: AUTHORITIES, a_handoff: aHandoff, files,
    raw_sha256: sha256(grammar) };
}

export function assertFrozenInputsEqual(expected, stage) {
  const observed = freezeAuthoritativeInputs(stage);
  if (observed.raw_sha256 !== expected.raw_sha256) {
    throw new Error(`B-extension four-stage authority drift:${expected.raw_sha256}:${observed.raw_sha256}`);
  }
  return observed;
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value)
    && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return value;
}

export async function fingerprintABaseDatabase(queryJson) {
  const profile = loadProfile();
  const fingerprint = {};
  for (const logicalName of TABLE_ORDER) {
    const table = LOGICAL_TABLES[logicalName];
    const rows = await queryJson(
      `SELECT to_jsonb(target) AS row FROM ${table} target `
      + `WHERE remark='${profile.scope_marker}' ORDER BY id`
    );
    const normalized = rows.map((entry) => normalize(entry.row ?? entry));
    if (normalized.length !== profile.expected_counts[logicalName]) {
      throw new Error(`A-base database count drift:${logicalName}:${normalized.length}`);
    }
    fingerprint[logicalName] = {
      count: normalized.length,
      sorted_id_sha256: hashCanonical(normalized.map((row) => row.id)),
      canonical_full_row_sha256: hashCanonical(normalized)
    };
  }
  return { tables: fingerprint, sha256: hashCanonical(fingerprint) };
}

export function fingerprintABaseFiles(files) {
  const sorted = files.map((file) => ({
    path: file.path.replaceAll("\\", "/"), bytes: file.bytes,
    raw_sha256: file.raw_sha256
  })).sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
  for (const file of sorted) {
    if (!Number.isInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/u.test(file.raw_sha256)) {
      throw new Error(`invalid A-base physical file fingerprint:${file.path}`);
    }
  }
  return { files: sorted, sha256: hashCanonical(sorted) };
}

export function validateExtensionState({ observedRows, profile = loadExtensionProfile(),
  aBaseProfile = loadProfile() }) {
  const expectedRows = extensionRows(profile, aBaseProfile);
  const tableFingerprints = {};
  for (const logicalName of EXTENSION_TABLE_ORDER) {
    const key = logicalName === "outbox" ? "event_id" : "id";
    const byKey = (left, right) => String(left[key]).localeCompare(String(right[key]));
    const observed = (observedRows[logicalName] ?? []).map(normalize).sort(byKey);
    const expected = expectedRows[logicalName].map(normalize).sort(byKey);
    if (observed.length !== profile.expected_counts[logicalName]
      || hashCanonical(observed) !== hashCanonical(expected)) {
      throw new Error(`B-extension state mismatch:${logicalName}`);
    }
    tableFingerprints[logicalName] = {
      count: observed.length,
      canonical_row_sha256: hashCanonical(observed)
    };
  }
  return { tables: tableFingerprints, data_sha256: hashCanonical(tableFingerprints) };
}

export function extensionSelectSql(profile = loadExtensionProfile(), aBaseProfile = loadProfile()) {
  const expected = extensionRows(profile, aBaseProfile);
  return EXTENSION_TABLE_ORDER.map((logicalName) => {
    const table = EXTENSION_TABLES[logicalName];
    const idColumn = logicalName === "outbox" ? "event_id" : "id";
    const ids = expected[logicalName].map((row) => `'${row[idColumn]}'::uuid`).join(",");
    return `SELECT '${logicalName}' AS logical_name,COALESCE(jsonb_agg(to_jsonb(target) `
      + `ORDER BY ${idColumn}),'[]'::jsonb) AS rows FROM ${table} target `
      + `WHERE ${idColumn} IN (${ids});`;
  }).join("\n");
}

export function computeCombinedChecksum({
  aDatabaseFingerprint,
  aFilesFingerprint,
  bFixture,
  mutationManifestSha256 = sha256(readFileSync(EXPECTED_MUTATIONS_PATH)),
  profileRawSha256 = sha256(readFileSync(EXTENSION_PROFILE_PATH))
}) {
  const mutations = loadExpectedMutations();
  const manifest = {
    grammar: "property-remediation-a-b-combined-v1",
    a: {
      profile: "property-remediation-a-base-v1", profile_version: 1,
      profile_checksum: AUTHORITIES.a_profile_checksum,
      fixture_handoff_sha256: AUTHORITIES.a_handoff,
      database_fingerprint_sha256: aDatabaseFingerprint.sha256,
      files_fingerprint_sha256: aFilesFingerprint.sha256
    },
    b: {
      profile: "property-remediation-b-extension-v1", profile_version: 1,
      profile_raw_sha256: profileRawSha256,
      data_sha256: bFixture.data_sha256,
      fixture_sha256: bFixture.fixture_sha256
    },
    b_schema_expand_sha256: AUTHORITIES.b_schema_expand,
    expected_mutations_sha256: mutationManifestSha256,
    expected_mutations: mutations.expected_mutations
  };
  return { manifest, combined_checksum: hashCanonical(manifest) };
}

export function extensionGeneratorSha256() {
  return hashCanonical({
    profile: sha256(readFileSync(EXTENSION_PROFILE_PATH)),
    mutations: sha256(readFileSync(EXPECTED_MUTATIONS_PATH)),
    fixture: fixtureSourceSha256(),
    validator: sha256(readFileSync(fileURLToPath(import.meta.url)))
  });
}
