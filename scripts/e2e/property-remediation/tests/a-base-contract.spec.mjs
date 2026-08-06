import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { canonicalize, sha256 } from "../lib/canonical.mjs";
import {
  A_BASE_ARTIFACT_HASH_KEYS,
  A_BASE_CLEANUP_JOURNAL_HASH_KEYS,
  assertFinalHandoffSourceState,
  projectABaseDatabaseCounts,
  validateHandoffContract,
  validateProvisionEvidenceContract
} from "../lib/evidence-contract.mjs";
import {
  CleanupJournal,
  readJournal,
  reduceJournal,
  writeJsonAtomic
} from "../lib/journal.mjs";
import {
  TABLE_ORDER,
  VALID_TEST_PNG,
  collectDistribution,
  computeProfileChecksum,
  loadProfile,
  rowsForTable,
  scopeForProfile
} from "../lib/profile.mjs";
import {
  exactCleanupSql,
  fixtureCopyChunks,
  migrationPlan
} from "../lib/sql-fixture.mjs";
import {
  REVIEWED_BOOTSTRAP_SHA256,
  REVIEWED_MIGRATION_175_SHA256,
  loadReviewedBootstrapContract
} from "../lib/reviewed-bootstrap-contract.mjs";
import {
  assertAStubEnvironment,
  assertDedicatedScope,
  exactCleanupPredicates
} from "../lib/safety.mjs";
import {
  decodeJsonFile,
  decodeJsonText,
  validateSchema
} from "../lib/strict-decoder.mjs";
import {
  A_BASE_EXACT_ACTORS,
  buildExactActors
} from "../roles/a-base-actors.mjs";

const cleanupSchema = decodeJsonFile(
  resolve("scripts/e2e/property-remediation/contracts/cleanup-event.schema.json")
);

test("A0-PROFILE-001 exact profile counts, distribution and checksum are deterministic", () => {
  const profile = loadProfile();
  const first = computeProfileChecksum(profile);
  const second = computeProfileChecksum(loadProfile());
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  for (const table of TABLE_ORDER) {
    assert.equal(
      [...rowsForTable(profile, table)].length,
      profile.expected_counts[table],
      table
    );
  }
  for (const table of TABLE_ORDER.filter(
    (name) => !["park", "building", "floor"].includes(name)
  )) {
    const expected = profile.park_distribution.map(
      (percent) => (profile.expected_counts[table] * percent) / 100
    );
    assert.deepEqual(collectDistribution(profile, table), expected, table);
  }
  assert.equal(VALID_TEST_PNG.length, 68);
  assert.deepEqual([...VALID_TEST_PNG.subarray(1, 4)], [80, 78, 71]);
  const handoverPark = new Map(
    [...rowsForTable(profile, "handover")].map((row) => [row.id, row.park_id])
  );
  for (const file of rowsForTable(profile, "sys_file")) {
    assert.equal(file.biz_type, "housing_handover");
    assert.equal(handoverPark.get(file.biz_id), file.park_id);
    assert.equal(file.file_size, VALID_TEST_PNG.length);
  }
});

test("A0-PROFILE-002 schema decoder rejects drift and unexpected fields", () => {
  const profile = loadProfile();
  const schema = decodeJsonFile(
    resolve("scripts/e2e/property-remediation/contracts/a-base-contract.schema.json")
  );
  assert.throws(
    () => validateSchema({ ...profile, unexpected: true }, schema),
    /unexpected property unexpected/
  );
  assert.throws(() => decodeJsonText("{", "bad-profile"), /invalid JSON/);
});

test("A0-CONTRACT-001 evidence schemas reject garbage-shaped keys and wrong migration 175", () => {
  const provisionSchema = decodeJsonFile(
    resolve("scripts/e2e/property-remediation/contracts/provision-evidence.schema.json")
  );
  const profile = loadProfile();
  const validProvision = {
    schema_version: "property-remediation-a-base-provision-evidence-v1",
    run_id: "abaseinvalid001",
    profile_checksum: computeProfileChecksum(profile),
    expected_counts: profile.expected_counts,
    actual_counts: {
      ...profile.expected_counts,
      sys_file_valid_association: profile.expected_counts.sys_file
    },
    physical_file_count: 2000,
    track_b_dependency_count: 0,
    evidence_ids: ["a0-profile", "a0-provision-repeat"],
    migrations: {
      bootstrap_sha256: REVIEWED_BOOTSTRAP_SHA256,
      applied: 183,
      skipped: [{
        filename: "000175_2026_responsibility_user_role_queue.sql",
        sha256: REVIEWED_MIGRATION_175_SHA256,
        reason_code: "production-data-patch-empty-db-fail-fast",
        rollback_residual: "0|0|0|0"
      }]
    }
  };
  assert.doesNotThrow(() =>
    validateProvisionEvidenceContract({
      value: validProvision,
      schema: provisionSchema,
      profile
    })
  );
  const fakeExpected = Object.fromEntries(
    Array.from({ length: 17 }, (_, index) => [`garbage_${index}`, index])
  );
  assert.throws(
    () =>
      validateSchema(
        { ...validProvision, expected_counts: fakeExpected },
        provisionSchema
      ),
    /missing required property park|unexpected property garbage_/
  );
  const fakeActual = Object.fromEntries(
    Array.from({ length: 18 }, (_, index) => [`garbage_${index}`, index])
  );
  assert.throws(
    () =>
      validateSchema(
        { ...validProvision, actual_counts: fakeActual },
        provisionSchema
      ),
    /missing required property park|unexpected property garbage_/
  );
  for (const skipped of [
    {
      ...validProvision.migrations.skipped[0],
      filename: "000175_wrong.sql"
    },
    {
      ...validProvision.migrations.skipped[0],
      sha256: "0".repeat(64)
    },
    {
      ...validProvision.migrations.skipped[0],
      rollback_residual: "0|0|0|1"
    }
  ]) {
    assert.throws(
      () =>
        validateSchema(
          {
            ...validProvision,
            migrations: { ...validProvision.migrations, skipped: [skipped] }
          },
          provisionSchema
        ),
      /must equal/
    );
  }
});

test("A0-CONTRACT-002 handoff keys, hashes and authoritative values fail closed", () => {
  const handoffSchema = decodeJsonFile(
    resolve("scripts/e2e/property-remediation/contracts/handoff.schema.json")
  );
  const artifactHashes = Object.fromEntries(
    A_BASE_ARTIFACT_HASH_KEYS.map((key, index) => [
      key,
      String(index + 1).repeat(64)
    ])
  );
  artifactHashes["source/actor-oracle.json"] = "a".repeat(64);
  const cleanupJournalHashes = Object.fromEntries(
    A_BASE_CLEANUP_JOURNAL_HASH_KEYS.map((key, index) => [
      key,
      String(index + 1).repeat(64)
    ])
  );
  const expected = {
    profileChecksum: "b".repeat(64),
    generatorSha256: "c".repeat(64),
    contractSha256: "d".repeat(64),
    schemaSha256: "e".repeat(64),
    actorOracleSha256: "a".repeat(64),
    currentCommit: "1".repeat(40),
    artifactHashes,
    cleanupJournalHashes
  };
  const validHandoff = {
    schema_version: "property-remediation-a-base-handoff-v1",
    profile: "property-remediation-a-base-v1",
    profile_checksum: expected.profileChecksum,
    generator_sha256: expected.generatorSha256,
    contract_sha256: expected.contractSha256,
    schema_sha256: expected.schemaSha256,
    bootstrap_sha256: REVIEWED_BOOTSTRAP_SHA256,
    run_ids: ["abaseinvalid001a", "abaseinvalid001b"],
    artifact_hashes: artifactHashes,
    cleanup_journal_hashes: cleanupJournalHashes,
    actor_oracle_sha256: expected.actorOracleSha256,
    traceability_sha256: sha256(
      `${artifactHashes["source/traceability.json"]}:` +
        artifactHashes["source/evidence-catalog.json"]
    ),
    current_commit: expected.currentCommit,
    environment_guard: {
      target: "exact-ephemeral-container-only",
      image: "postgres:16-alpine",
      database: "pr192_track_a_base_fixture",
      database_url_override: "forbidden",
      artifact_scope: "artifacts/property-remediation/runs/<run-id>"
    },
    evidence_ids: [
      "a0-profile",
      "a0-provision-repeat",
      "a0-safety",
      "a0-cleanup",
      "a0-role-contract"
    ],
    residual_count: 0,
    track_b_dependency_count: 0
  };
  assert.doesNotThrow(() =>
    validateHandoffContract({
      value: validHandoff,
      schema: handoffSchema,
      expected
    })
  );
  assert.throws(
    () =>
      validateSchema(
        {
          ...validHandoff,
          artifact_hashes: Object.fromEntries(
            Array.from({ length: 7 }, (_, index) => [
              `arbitrary_${index}`,
              "f".repeat(64)
            ])
          )
        },
        handoffSchema
      ),
    /missing required property a\/provision-evidence.json|unexpected property arbitrary_/
  );
  assert.throws(
    () =>
      validateSchema(
        {
          ...validHandoff,
          cleanup_journal_hashes: {
            arbitrary: "f".repeat(64),
            another: "e".repeat(64)
          }
        },
        handoffSchema
      ),
    /missing required property a\/cleanup-manifest.jsonl|unexpected property arbitrary/
  );
  for (const key of [
    "profile_checksum",
    "generator_sha256",
    "contract_sha256",
    "schema_sha256",
    "actor_oracle_sha256",
    "traceability_sha256"
  ]) {
    assert.throws(
      () =>
        validateHandoffContract({
          value: { ...validHandoff, [key]: "f".repeat(64) },
          schema: handoffSchema,
          expected
        }),
      /does not match|hashes disagree/
    );
  }
  assert.throws(
    () =>
      validateHandoffContract({
        value: { ...validHandoff, current_commit: "f".repeat(40) },
        schema: handoffSchema,
        expected
      }),
    /current_commit does not match/
  );
  assert.throws(
    () =>
      validateHandoffContract({
        value: {
          ...validHandoff,
          artifact_hashes: {
            ...validHandoff.artifact_hashes,
            "a/provision-evidence.json": "f".repeat(64)
          }
        },
        schema: handoffSchema,
        expected
      }),
    /is not the file hash/
  );
  assert.throws(
    () =>
      validateHandoffContract({
        value: {
          ...validHandoff,
          cleanup_journal_hashes: {
            ...validHandoff.cleanup_journal_hashes,
            "a/cleanup-manifest.jsonl": "f".repeat(64)
          }
        },
        schema: handoffSchema,
        expected
      }),
    /is not the journal hash/
  );
});

test("A0-CONTRACT-003 prerequisite environment is exact", () => {
  const prerequisiteSchema = decodeJsonFile(
    resolve("scripts/e2e/property-remediation/contracts/prerequisites.schema.json")
  );
  const prerequisites = decodeJsonFile(
    resolve("scripts/e2e/property-remediation/profiles/frozen-handoffs.json")
  );
  assert.throws(
    () =>
      validateSchema(
        {
          ...prerequisites,
          environment_guard: {
            ...prerequisites.environment_guard,
            target: "shared-database"
          }
        },
        prerequisiteSchema
      ),
    /must equal "exact-ephemeral-container-only"/
  );
});

test("A0-CONTRACT-004 final handoff rejects dirty, untracked and absent sources", () => {
  const sourcePaths = [
    "scripts/e2e/property-remediation/a-base-core.mjs",
    "scripts/e2e/property-remediation/lib/new-untracked.mjs"
  ];
  const committed = new Set(sourcePaths);
  const cleanGit = (args) => {
    if (args[0] === "rev-parse") return `${"a".repeat(40)}\n`;
    if (args[0] === "cat-file") {
      const path = args[2].slice("HEAD:".length);
      if (!committed.has(path)) throw new Error("missing");
      return "";
    }
    if (args[0] === "status") return "";
    throw new Error(`unexpected git command ${args.join(" ")}`);
  };
  assert.equal(
    assertFinalHandoffSourceState({
      rootDir: process.cwd(),
      sourcePaths,
      runGit: cleanGit
    }),
    "a".repeat(40)
  );
  for (const status of [
    " M scripts/e2e/property-remediation/a-base-core.mjs\n",
    "?? scripts/e2e/property-remediation/lib/new-untracked.mjs\n"
  ]) {
    assert.throws(
      () =>
        assertFinalHandoffSourceState({
          rootDir: process.cwd(),
          sourcePaths,
          runGit: (args) => args[0] === "status" ? status : cleanGit(args)
        }),
      /requires clean tracked A-base sources/
    );
  }
  assert.throws(
    () =>
      assertFinalHandoffSourceState({
        rootDir: process.cwd(),
        sourcePaths,
        runGit: (args) => {
          if (
            args[0] === "cat-file" &&
            args[2].endsWith("lib/new-untracked.mjs")
          ) {
            throw new Error("missing");
          }
          return cleanGit(args);
        }
      }),
    /HEAD does not contain A-base source/
  );
});

test("A0-CONTRACT-005 database probes project exact 18 actual counts without Track B keys", () => {
  const profile = loadProfile();
  const rawCounts = {
    ...profile.expected_counts,
    sys_file_valid_association: profile.expected_counts.sys_file,
    ...Object.fromEntries(
      profile.track_b_tables.map((table) => [`track_b:${table}`, 0])
    )
  };
  const projected = projectABaseDatabaseCounts({ rawCounts, profile });
  assert.deepEqual(projected.actualCounts, {
    ...profile.expected_counts,
    sys_file_valid_association: profile.expected_counts.sys_file
  });
  assert.equal(Object.keys(projected.actualCounts).length, 18);
  assert.equal(
    Object.keys(projected.actualCounts).some((key) =>
      key.startsWith("track_b:")
    ),
    false
  );
  assert.equal(projected.trackBDependencyCount, 0);
  const firstTrackB = profile.track_b_tables[0];
  assert.throws(
    () =>
      projectABaseDatabaseCounts({
        rawCounts: {
          ...rawCounts,
          [`track_b:${firstTrackB}`]: -1
        },
        profile
      }),
    /unexpectedly depends on a Track B table/
  );
  assert.throws(
    () =>
      projectABaseDatabaseCounts({
        rawCounts: { ...rawCounts, "track_b:garbage": 0 },
        profile
      }),
    /raw database counts keys drift/
  );
});

test("A0-ROLES-001 actors are generated from exact shared bundles", () => {
  const support = A_BASE_EXACT_ACTORS.find((actor) => actor.kind === "support");
  const exception = A_BASE_EXACT_ACTORS.find(
    (actor) => actor.kind === "exception_super"
  );
  assert.ok(support);
  assert.ok(exception);
  assert.ok(support.expected.modules.includes("asset"));
  assert.ok(support.expected.permissions.every((permission) => !permission.includes("*")));
  assert.ok(
    support.expected.permissions.some((permission) => permission.endsWith(":page"))
  );
  assert.deepEqual(exception.expected, {
    modules: [],
    permissions: [],
    menu_routes: [],
    data_scopes: []
  });
});

test("A0-ROLES-002 property permission oracle is exactly 65 while actors exclude broad codes", async () => {
  const shared = await import(
    "../../../../packages/shared/dist/property-business/permissions.js"
  );
  const values = Object.values(shared.PROPERTY_BUSINESS_PERMISSIONS);
  assert.equal(values.length, 65);
  assert.equal(new Set(values).size, 65);
  const forbidden = new Set([
    "homestay:operations",
    "housing_rental:operations",
    "*"
  ]);
  for (const actor of A_BASE_EXACT_ACTORS.filter(
    (candidate) => candidate.kind !== "exception_super"
  )) {
    assert.ok(
      actor.expected.permissions.every(
        (permission) => !forbidden.has(permission) && !permission.includes("*")
      )
    );
  }
});

test("A0-ROLES-003 frozen oracle rejects shared bundle drift and keeps support read-only", () => {
  const frozen = decodeJsonFile(
    resolve("scripts/e2e/property-remediation/roles/a-base-actor-oracle.json")
  );
  const drifted = structuredClone(frozen);
  drifted.actors[0].expected.permissions =
    drifted.actors[0].expected.permissions.filter(
      (permission) => permission !== "homestay:booking:confirm"
    );
  assert.throws(
    () => buildExactActors(drifted),
    /shared bundle permissions drift/
  );
  const support = A_BASE_EXACT_ACTORS.find((actor) => actor.kind === "support");
  assert.equal(support.expected.permissions.length, 8);
  assert.ok(
    support.expected.permissions.every(
      (permission) =>
        !/:(create|update|manage|approve|sign|activate|checkout|cancel|confirm|reschedule|execute|register|waive|generate|transfer)$/.test(
          permission
        )
    )
  );
  const exception = A_BASE_EXACT_ACTORS.find(
    (actor) => actor.kind === "exception_super"
  );
  assert.deepEqual(exception.identity, {
    is_super: true,
    raw_permissions: ["*"]
  });
});

test("A0-SAFETY-001 dedicated scope and ignored artifact root pass", () => {
  const profile = loadProfile();
  const scope = scopeForProfile(profile);
  assertDedicatedScope({ profile, ...scope });
  const runId = "abase20260730safe";
  const artifactDir = resolve(
    `artifacts/property-remediation/runs/${runId}`
  );
  assert.doesNotThrow(() =>
    assertAStubEnvironment({
      runId,
      artifactDir,
      env: {},
      rootDir: process.cwd()
    })
  );
});

test("A0-SAFETY-002 non-test environments and outside artifacts fail closed", () => {
  const runId = "abase20260730deny";
  assert.throws(
    () =>
      assertAStubEnvironment({
        runId,
        artifactDir: resolve("scripts/generated-run"),
        env: {},
        rootDir: process.cwd()
      }),
    /ignored run directory/
  );
  assert.throws(
    () =>
      assertAStubEnvironment({
        runId,
        artifactDir: resolve(`artifacts/property-remediation/runs/${runId}`),
        env: { DEPLOY_ENV: "production" },
        rootDir: process.cwd()
      }),
    /refuses non-test/
  );
  assert.throws(
    () =>
      assertAStubEnvironment({
        runId,
        artifactDir: resolve(`artifacts/property-remediation/runs/${runId}`),
        env: { DATABASE_URL: "postgresql://127.0.0.1/shared" },
        rootDir: process.cwd()
      }),
    /database URL overrides are forbidden/
  );
});

test("A0-SAFETY-003 cleanup requires exact keys and reverse table order", () => {
  assert.throws(
    () => exactCleanupPredicates({ tenantId: "t", parkIds: [], idsByTable: {} }),
    /exact deterministic/
  );
  assert.deepEqual(
    exactCleanupPredicates({
      tenantId: "tenant",
      parkIds: ["park"],
      idsByTable: { parent: ["p"], child: ["c"] }
    }).map((entry) => entry.table),
    ["child", "parent"]
  );
});

test("A0-SAFETY-004 COPY chunks are transactional and cleanup never uses fuzzy scope deletion", () => {
  const profile = loadProfile();
  const chunks = [...fixtureCopyChunks(profile, 1000)];
  const inserted = Object.fromEntries(TABLE_ORDER.map((table) => [table, 0]));
  for (const chunk of chunks) {
    inserted[chunk.logicalName] += chunk.count;
    assert.match(chunk.sql, /^BEGIN;/);
    assert.match(chunk.sql, /pg_advisory_xact_lock/);
    assert.match(chunk.sql, /COPY [a-z_]+ \(.+\) FROM STDIN/);
    assert.match(chunk.sql, /COMMIT;\n$/);
  }
  assert.deepEqual(inserted, profile.expected_counts);
  const cleanup = exactCleanupSql(profile);
  assert.doesNotMatch(cleanup, /\bLIKE\b/i);
  assert.doesNotMatch(cleanup, /\bTRUNCATE\b/i);
  assert.match(cleanup, /target\.id = keys\.id/);
  assert.ok(cleanup.indexOf("DELETE FROM sys_file") < cleanup.indexOf("DELETE FROM biz_park"));
});

test("A0-PROVISION-001 migration plan freezes 000001-000183 and skips only 000175", () => {
  const plan = migrationPlan();
  const reviewed = loadReviewedBootstrapContract();
  assert.equal(plan.length, 184);
  assert.equal(plan.filter((entry) => entry.number === 136).length, 2);
  assert.equal(plan.filter((entry) => entry.number === 175).length, 1);
  assert.equal(plan.filter((entry) => entry.number !== 175).length, 183);
  assert.equal(reviewed.bootstrapSha256, REVIEWED_BOOTSTRAP_SHA256);
  assert.equal(reviewed.migration175.sha256, REVIEWED_MIGRATION_175_SHA256);
});

test("A0-JOURNAL-001 journal is durable, chained and reducible", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "a-base-journal-"));
  const path = resolve(directory, "cleanup.jsonl");
  const journal = new CleanupJournal({
    path,
    runId: "abasejournal001",
    schema: cleanupSchema,
    clock: () => "2026-07-30T01:00:00.000Z"
  });
  for (const state of [
    "planned",
    "creating",
    "created",
    "cleanup_pending",
    "cleaned"
  ]) {
    journal.append({
      resourceType: "fixture_scope",
      resourceKey: "scope-1",
      state
    });
  }
  const events = readJournal(path, cleanupSchema);
  assert.equal(events.length, 5);
  assert.equal(reduceJournal(events).get("fixture_scope:scope-1").state, "cleaned");
  assert.deepEqual(journal.pendingInReverseOrder(), []);
});

test("A0-JOURNAL-002 torn final record is repaired but verified prefix remains", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "a-base-torn-"));
  const path = resolve(directory, "cleanup.jsonl");
  const journal = new CleanupJournal({
    path,
    runId: "abasejournal002",
    schema: cleanupSchema,
    clock: () => "2026-07-30T01:00:00.000Z"
  });
  journal.append({
    resourceType: "physical_file",
    resourceKey: "one.png",
    state: "planned"
  });
  writeFileSync(path, `${readFileSync(path, "utf8")}{"schema_version":`);
  const repaired = readJournal(path, cleanupSchema, { repairTornTail: true });
  assert.equal(repaired.length, 1);
  assert.ok(readFileSync(path, "utf8").endsWith("\n"));
});

test("A0-JOURNAL-003 newline-terminated corruption fails closed", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "a-base-corrupt-"));
  const path = resolve(directory, "cleanup.jsonl");
  const journal = new CleanupJournal({
    path,
    runId: "abasejournal003",
    schema: cleanupSchema,
    clock: () => "2026-07-30T01:00:00.000Z"
  });
  journal.append({
    resourceType: "physical_file",
    resourceKey: "one.png",
    state: "planned"
  });
  const corrupted = readFileSync(path, "utf8").replace(
    '"resource_key":"one.png"',
    '"resource_key":"two.png"'
  );
  writeFileSync(path, corrupted);
  assert.throws(
    () => readJournal(path, cleanupSchema, { repairTornTail: true }),
    /event hash mismatch/
  );
});

test("A0-JOURNAL-003B complete hash corruption without newline also fails closed", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "a-base-corrupt-tail-"));
  const path = resolve(directory, "cleanup.jsonl");
  const journal = new CleanupJournal({
    path,
    runId: "abasejournal003b",
    schema: cleanupSchema,
    clock: () => "2026-07-30T01:00:00.000Z"
  });
  journal.append({
    resourceType: "physical_file",
    resourceKey: "one.png",
    state: "planned"
  });
  const corrupted = readFileSync(path, "utf8")
    .trimEnd()
    .replace('"resource_key":"one.png"', '"resource_key":"two.png"');
  writeFileSync(path, corrupted);
  assert.throws(
    () => readJournal(path, cleanupSchema, { repairTornTail: true }),
    /event hash mismatch/
  );
});

test("A0-JOURNAL-004 invalid lifecycle transition fails before append", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "a-base-state-"));
  const path = resolve(directory, "cleanup.jsonl");
  const journal = new CleanupJournal({
    path,
    runId: "abasejournal004",
    schema: cleanupSchema,
    clock: () => "2026-07-30T01:00:00.000Z"
  });
  journal.append({
    resourceType: "fixture_scope",
    resourceKey: "scope",
    state: "planned"
  });
  assert.throws(
    () =>
      journal.append({
        resourceType: "fixture_scope",
        resourceKey: "scope",
        state: "cleaned"
      }),
    /invalid journal transition/
  );
});

test("atomic evidence writer produces canonical readable JSON", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "a-base-atomic-"));
  const path = resolve(directory, "summary.json");
  const value = { z: 1, a: [2, 3] };
  writeJsonAtomic(path, value);
  assert.deepEqual(decodeJsonText(readFileSync(path, "utf8"), path), value);
  assert.equal(canonicalize(value), '{"a":[2,3],"z":1}');
});
