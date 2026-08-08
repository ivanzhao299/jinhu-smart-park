import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../../..");
const runner = readFileSync(resolve(directory,
  "track-b2a-c3-legacy-compatibility-gate.mjs"), "utf8");
const lifecycle = readFileSync(resolve(directory,
  "track-b2a-c3-runtime-lifecycle.mjs"), "utf8");
const goldenPath = resolve(root,
  ".trellis/tasks/07-30-pr192-b-approval-runtime-tasks/research/"
  + "b2a-c3-0-formal-candidate-20260801f.json");
const goldenBytes = readFileSync(goldenPath);
const golden = JSON.parse(goldenBytes.toString("utf8"))
  .legacy_compatibility.before.hook.rows;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const traversalSource = runner.slice(
  runner.indexOf("// STATIC_TRAVERSAL_BEGIN") + "// STATIC_TRAVERSAL_BEGIN".length,
  runner.indexOf("// STATIC_TRAVERSAL_END")
);
const traversalContext = { lstatSync, readdirSync, resolve };
vm.runInNewContext(`${traversalSource}\nglobalThis.candidateRecursiveFiles=recursiveFiles;`,
  traversalContext);
const candidateRecursiveFiles = traversalContext.candidateRecursiveFiles;
const freezeAssertSource = runner.slice(
  runner.indexOf("// STATIC_FREEZE_ASSERT_BEGIN") + "// STATIC_FREEZE_ASSERT_BEGIN".length,
  runner.indexOf("// STATIC_FREEZE_ASSERT_END")
);
const freezeAssertContext = {};
vm.runInNewContext(`${freezeAssertSource}\nglobalThis.candidateAssertFreeze=assertFreezeMatch;`,
  freezeAssertContext);
const candidateAssertFreeze = freezeAssertContext.candidateAssertFreeze;
const frozenReadSource = runner.slice(
  runner.indexOf("// STATIC_FROZEN_READ_BEGIN") + "// STATIC_FROZEN_READ_BEGIN".length,
  runner.indexOf("// STATIC_FROZEN_READ_END")
);
const frozenReadContext = {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, sha256
};
vm.runInNewContext(`${frozenReadSource}\nglobalThis.candidateFrozenRead=readExactFrozenFile;`,
  frozenReadContext);
const candidateFrozenRead = frozenReadContext.candidateFrozenRead;

function treeSnapshot(directoryPath) {
  const files = candidateRecursiveFiles(directoryPath, (path) => path.endsWith(".txt"));
  const rows = files.map((path) => ({ path: relative(directoryPath, path),
    raw_sha256: sha256(readFileSync(path)) }));
  return { rows, raw_sha256: sha256(`${JSON.stringify(rows)}\n`) };
}

test("golden is the single locked C3-0 f.json hook rows authority", () => {
  assert.equal(sha256(goldenBytes),
    "5dfd0e69ae6f5974d6c3f80ebd8160abbab066da4907a3d33aed24824d1281ba");
  assert.equal(sha256(`${JSON.stringify(golden)}\n`),
    "3c2bd8a18ac4236a8db1e4eff583e9daec8c8aa4fac56e21011dee69ee5bd9ff");
  assert.equal(golden.length, 39);
  assert.match(runner, /const goldenPath = resolve\(researchRoot, "b2a-c3-0-formal-candidate-20260801f\.json"\)/u);
  assert.match(runner, /document\?\.legacy_compatibility\?\.before\?\.hook\?\.rows/u);
  assert.match(runner, /if \(sha256\(bytes\) !== GOLDEN_RAW_SHA256\)/u);
  assert.match(runner, /sha256\(`\$\{JSON\.stringify\(rows\)\}\\n`\) !== GOLDEN_ROWS_SHA256/u);
  assert.doesNotMatch(runner, /expected\w*\s*=\s*observeLegacyRows/u);
});

test("matrix is exact sorted 13 actions x 3 statuses x 3 immutable fields", () => {
  const keys = golden.map((row) => `${row.actionId}\t${row.receiptStatus}`);
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(new Set(keys).size, 39);
  assert.equal(new Set(golden.map((row) => row.actionId)).size, 13);
  for (const actionId of new Set(golden.map((row) => row.actionId))) {
    assert.deepEqual(golden.filter((row) => row.actionId === actionId)
      .map((row) => row.receiptStatus).sort(), ["completed", "failed", "started"]);
  }
  assert.match(runner, /const legacyFields = \["requestHash", "resultHash", "resultRef"\]/u);
  assert.match(runner, /comparisons\.length !== 117/u);
  assert.match(runner, /pre195:\s*pre195\[index\]\?\.\[field\]/u);
  assert.match(runner, /post_migration_pre_port:\s*postMigrationPrePort\[index\]\?\.\[field\]/u);
  assert.match(runner, /post_port:\s*postPort\[index\]\?\.\[field\]/u);
  assert.match(runner, /field_comparison_count:\s*117/u);
});

for (const field of ["requestHash", "resultHash", "resultRef"]) {
  test(`one tampered ${field} produces exactly one field mismatch`, () => {
    const observed = JSON.parse(JSON.stringify(golden));
    observed[0][field] = observed[0][field] === null ? "tampered" : `${observed[0][field]}-tampered`;
    const mismatches = golden.flatMap((expected, index) =>
      ["requestHash", "resultHash", "resultRef"].filter((candidate) =>
        observed[index][candidate] !== expected[candidate]).map((candidate) => ({
        actionId: expected.actionId, receiptStatus: expected.receiptStatus, field: candidate
      })));
    assert.deepEqual(mismatches, [{ actionId: golden[0].actionId,
      receiptStatus: golden[0].receiptStatus, field }]);
  });
}

test("old-schema replay surrounds 000195 and current adapter port with observations", () => {
  const seed = runner.indexOf("seedExactOldSchemaFixture();");
  const before = runner.indexOf("const pre195 = observeLegacyRows()");
  const migration = runner.indexOf("applyMigration(migration195)");
  const afterMigration = runner.indexOf("const postMigrationPrePort = observeLegacyRows()");
  const adapter = runner.indexOf("const specs = [runPgSpec(c3Spec, url)]");
  const afterPort = runner.indexOf("const postPort = observeLegacyRows()");
  assert.ok(seed > 0 && seed < before && before < migration && migration < afterMigration
    && afterMigration < adapter && adapter < afterPort);
  assert.match(runner, /INSERT INTO biz_property_mutation_receipt\(tenant_id,park_id,actor_id,action_id,target_id,client_key,request_hash\)/u);
  assert.match(runner, /'c3-pre195-legacy'/u);
  assert.match(runner, /specs\.push\(\.\.\.pgSpecsAfterPort\.filter/u);
  assert.match(runner, /c3-b1-foundation-local-regression/u);
});

test("four dynamic input freezes are exact and occur at the signed stages", () => {
  for (const stage of ["before-create", "after-local", "after-pg-tests", "after-cleanup"]) {
    assert.match(runner, new RegExp(`(?:captureInputs|assertInputsFrozen)\\(\\"${stage}\\"\\)`));
  }
  assert.match(runner, /assertFreezeMatch\(inputFreeze, observed, stage\)/u);
  assert.match(runner, /inputFreezes\.push\(observed\)/u);
  assert.match(runner, /signed input is not a regular non-symlink file/u);
  assert.match(runner, /metadata\.isSymbolicLink\(\) \|\| !metadata\.isFile\(\)/u);
  assert.match(runner, /function buildSignedInputs\(\)/u);
  assert.match(runner, /const files = buildSignedInputs\(\)\.map/u);
  assert.doesNotMatch(runner, /const (?:allMigrations|baselineMigrations|approvalSpecs|foundationSpecs|signedInputs)\s*=/u);
  assert.match(runner, /currentBaselineMigrations\(\)/u);
  assert.match(runner, /currentLocalRegressionSpecs\(\)/u);
  assert.match(runner, /currentApprovalPgSpecs\(\)/u);
});

test("real traversal detects closure drift and rejects symlink, special and type changes", () => {
  const temporary = mkdtempSync("/tmp/c3-compat-closure-");
  try {
    mkdirSync(resolve(temporary, "nested"));
    writeFileSync(resolve(temporary, "a.txt"), "a\n");
    writeFileSync(resolve(temporary, "nested/b.txt"), "b\n");
    const frozen = treeSnapshot(temporary);

    writeFileSync(resolve(temporary, "a.txt"), "modified\n");
    const modified = treeSnapshot(temporary);
    assert.deepEqual(modified.rows.map((row) => row.path), frozen.rows.map((row) => row.path));
    assert.throws(() => candidateAssertFreeze(frozen, modified, "modify"), /signed input drift/u);
    writeFileSync(resolve(temporary, "a.txt"), "a\n");

    writeFileSync(resolve(temporary, "added.txt"), "added\n");
    const added = treeSnapshot(temporary);
    assert.notDeepEqual(added.rows.map((row) => row.path), frozen.rows.map((row) => row.path));
    assert.throws(() => candidateAssertFreeze(frozen, added, "add"), /signed input drift/u);
    rmSync(resolve(temporary, "added.txt"));

    rmSync(resolve(temporary, "nested/b.txt"));
    const deleted = treeSnapshot(temporary);
    assert.notDeepEqual(deleted.rows.map((row) => row.path), frozen.rows.map((row) => row.path));
    assert.throws(() => candidateAssertFreeze(frozen, deleted, "delete"), /signed input drift/u);
    writeFileSync(resolve(temporary, "nested/b.txt"), "b\n");

    symlinkSync(resolve(temporary, "a.txt"), resolve(temporary, "ignored-link.bin"));
    assert.throws(() => treeSnapshot(temporary), /contains symlink/u);
    rmSync(resolve(temporary, "ignored-link.bin"));

    const fifo = resolve(temporary, "ignored-special.bin");
    const madeFifo = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
    assert.equal(madeFifo.status, 0, madeFifo.stderr);
    assert.throws(() => treeSnapshot(temporary), /contains special file/u);
    rmSync(fifo);

    writeFileSync(resolve(temporary, "shape.txt"), "file\n");
    const fileShape = treeSnapshot(temporary);
    rmSync(resolve(temporary, "shape.txt"));
    mkdirSync(resolve(temporary, "shape.txt"));
    writeFileSync(resolve(temporary, "shape.txt/child.txt"), "child\n");
    assert.throws(() => candidateAssertFreeze(fileShape, treeSnapshot(temporary), "file-to-dir"),
      /signed input drift/u);

    const directoryShape = treeSnapshot(temporary);
    rmSync(resolve(temporary, "shape.txt"), { recursive: true });
    writeFileSync(resolve(temporary, "shape.txt"), "file-again\n");
    assert.throws(() => candidateAssertFreeze(directoryShape, treeSnapshot(temporary), "dir-to-file"),
      /signed input drift/u);

    assert.throws(() => candidateRecursiveFiles(resolve(temporary, "shape.txt")),
      /root\/branch is not a real directory/u);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("actual frozen-byte reader rejects execution-time migration or seed tampering", () => {
  const temporary = mkdtempSync("/tmp/c3-compat-frozen-read-");
  try {
    const candidate = resolve(temporary, "candidate.sql");
    writeFileSync(candidate, "SELECT 1;\n");
    const expected = sha256(readFileSync(candidate));
    assert.equal(candidateFrozenRead(candidate, expected, "migration").toString(), "SELECT 1;\n");
    writeFileSync(candidate, "SELECT 2;\n");
    assert.throws(() => candidateFrozenRead(candidate, expected, "migration"), /SHA drift/u);
    writeFileSync(candidate, "SELECT 1;\n");

    const link = resolve(temporary, "seed.sql");
    symlinkSync(candidate, link);
    assert.throws(() => candidateFrozenRead(link, sha256(readFileSync(candidate)), "seed"),
      /not a regular non-symlink file/u);

    const alternate = resolve(temporary, "alternate.sql");
    writeFileSync(alternate, "SELECT 1;\n");
    const displaced = resolve(temporary, "displaced.sql");
    assert.throws(() => candidateFrozenRead(candidate, expected, "pre-open-symlink-race", {
      afterPrecheck: (path) => { renameSync(path, displaced); symlinkSync(alternate, path); }
    }));
    rmSync(candidate);
    renameSync(displaced, candidate);

    const oldInode = resolve(temporary, "old-inode.sql");
    assert.throws(() => candidateFrozenRead(candidate, expected, "pre-open-inode-race", {
      afterPrecheck: (path) => {
        renameSync(path, oldInode);
        writeFileSync(path, "SELECT 1;\n");
      }
    }), /identity changed before read/u);
    rmSync(oldInode);

    const openedInode = resolve(temporary, "opened-inode.sql");
    assert.throws(() => candidateFrozenRead(candidate, expected, "open-read-symlink-race", {
      afterOpen: (_descriptor, path) => {
        renameSync(path, openedInode);
        symlinkSync(alternate, path);
      }
    }), /identity changed while reading/u);
    rmSync(candidate);
    renameSync(openedInode, candidate);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("seed and every migration execution/history read use the unified frozen-byte helper", () => {
  assert.match(runner, /openSync\(path, constants\.O_RDONLY \| constants\.O_NOFOLLOW\)/u);
  assert.match(runner, /fstatSync\(descriptor, \{ bigint: true \}\)/u);
  assert.match(runner, /const bytes = readFileSync\(descriptor\)/u);
  assert.match(runner, /finally \{\n\s*if \(descriptor !== null\) closeSync\(descriptor\);/u);
  assert.match(runner,
    /function applyMigration\(pathOrName\) \{[\s\S]*?readFrozenRuntimeFile\(path,[\s\S]*?return psql\(bytes\.toString\("utf8"\)\);\n\}/u);
  assert.match(runner,
    /const seedBytes = readFrozenRuntimeFile\(seed,[\s\S]*?psql\(seedBytes\.toString\("utf8"\)\);/u);
  assert.match(runner, /applyMigration\("000183_property_business_granular_rbac\.sql"\)/u);
  assert.match(runner, /applyMigration\("000184_property_workbench_read_permissions\.sql"\)/u);
  assert.match(runner,
    /function recordHistory\(name\) \{[\s\S]*?readFrozenRuntimeFile\(migrationPath,/u);
  assert.doesNotMatch(runner, /psql\(readFileSync\((?:seed|resolve\(migrationRoot)/u);
  assert.doesNotMatch(runner, /applyMigration\s*=\s*\([^)]*\)\s*=>\s*psql\(readFileSync/u);
});

test("signed closure includes gates, sidecars, full production/tests, migrations, seed and configs", () => {
  for (const required of [
    "b2a-c1-5-final-gate.md", "b2a-c1-5-implementation-handoff.md",
    "b2a-c3-0-receipt-contract-correction-plan.md",
    "b2a-c3-0-000195-final-gate-signoff.md", "legacy-action-authority-v1.txt",
    "port-v2-action-identity-mode-v1.txt", "b1-approval-runtime-final-gate.md",
    "b-approval-runtime-v2.txt", "b2a-c3-final-gate-signoff.md",
    "b2a-c3-runtime-formal-candidate-20260801d.json",
    "b2a-c3-runtime-formal-candidate-20260801d.manifest.txt",
    "appmodule-contract-v2-reattestation.txt", "b0-contract-freeze-current.md",
    "b-property-foundation-contract-v2-attestation.txt", "b-property-foundation-runtime-v2.txt",
    "000195_property_mutation_receipt_contract_v2.sql", "database/seeds",
    "apps/api/src", "packages/shared/src", "packages/shared/test", "pnpm-lock.yaml",
    "pnpm-workspace.yaml", "tsconfig.base.json", "eslint.config.mjs",
    "track-b2a-c3-runtime-lifecycle.mjs", "bootstrap/ephemeral-postgres.mjs"
  ]) assert.match(runner, new RegExp(required.replaceAll(".", "\\.")));
  assert.match(runner,
    /\["json", "catalog\.json", "functions\.json", "security\.json", "manifest\.txt"\]/u);
  assert.match(runner, /`b2a-c3-0-formal-candidate-20260801f\.\$\{suffix\}`/u);
  assert.match(runner, /\.\.\.recursiveFiles\(migrationRoot/u);
  assert.match(runner, /\.\.\.recursiveFiles\(seedRoot\)/u);
  assert.match(runner, /\.\.\.recursiveFiles\(resolve\(root, "apps\/api\/src"\)/u);
});

test("publication is immutable 0600, direct-child, reservation-backed and emits failures", () => {
  assert.match(runner, /new direct research \.json child/u);
  assert.match(runner, /reserveRunId\(\{ reservationPath, runId/u);
  assert.match(runner, /status:\s*"failed", candidate_admissible:\s*false/u);
  assert.match(runner, /status:\s*"passed", candidate_admissible:\s*true/u);
  assert.match(lifecycle, /writeFileSync\(reservationPath, bytes, \{ flag: "wx", mode: 0o600 \}\)/u);
  assert.match(lifecycle, /writeFileSync\(manifestPath, manifestBytes, \{ flag: "wx", mode: 0o600 \}\)/u);
  assert.match(lifecycle, /writeFileSync\(artifactPath, bytes, \{ flag: "wx", mode: 0o600 \}\)/u);
  assert.ok(lifecycle.indexOf("writeFileSync(manifestPath, manifestBytes")
    < lifecycle.indexOf("writeFileSync(artifactPath, bytes"));
});

test("cleanup, signal, timeout and original failure stage fail closed", () => {
  assert.match(runner, /cleanupExactLifecycle\(\{ creationAttempted, containerName, containerId, volumeName/u);
  assert.match(runner, /validateContainer: \(observed\) => assertExactEphemeralPostgresContainer/u);
  assert.match(runner, /removeContainer: \(id\) => docker\(\["rm", "-f", "-v", id\]\)/u);
  assert.match(runner, /removeVolume: \(name\) => docker\(\["volume", "rm", name\]\)/u);
  assert.match(runner, /for \(const signal of \["SIGINT", "SIGTERM", "SIGHUP"\]\)/u);
  assert.match(runner, /result\.error\?\.code === "ETIMEDOUT"/u);
  assert.match(runner, /original_failure_stage:\s*originalFailureStage/u);
  assert.match(runner, /if \(originalFailureStage === null\) originalFailureStage = stage/u);
  assert.match(runner, /container_absent:\s*false/u);
  assert.match(runner, /anonymous_volume_absent:\s*false/u);
});
