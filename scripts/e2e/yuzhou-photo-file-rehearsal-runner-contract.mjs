#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";

import { rollbackYuzhouPhotoFileRehearsalRun, runYuzhouPhotoFileRehearsal } from "../hr-cutover/yuzhou-photo-file-rehearsal-runner.mjs";
import { YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE } from "../hr-cutover/yuzhou-photo-file-materialization-rehearsal.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "yuzhou-photo-runner-"));
const stageRoot = join(root, "stage"), storageRoot = join(root, "storage");
for (const directory of [root, stageRoot, storageRoot]) { if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 }); chmodSync(directory, 0o700); }
after(() => rmSync(root, { recursive: true, force: true }));

function materialization(seed) {
  const bytes = Buffer.from(`synthetic-jpeg:${seed}`), normalizedContentSha256 = sha(bytes);
  writeFileSync(join(stageRoot, `${normalizedContentSha256}.jpg`), bytes, { mode: 0o600 });
  chmodSync(join(stageRoot, `${normalizedContentSha256}.jpg`), 0o600);
  return {
    mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, runId: `runner-photo-${seed}`, stageRoot, storageRoot,
    records: [{ sourceIdentitySha256: sha(`identity:${seed}`), sourceRowSha256: sha(`row:${seed}`), sourceContentSha256: sha(`source:${seed}`), normalizedContentSha256, employeeId: "00000000-0000-4000-8000-000000000010", normalizedFile: `${normalizedContentSha256}.jpg` }]
  };
}

function transactional({ failure = null } = {}) {
  const calls = [];
  return { calls, async execute(callback) {
    const tx = { async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (failure && sql.includes(failure)) throw new Error("database failure");
      if (sql.includes("transaction-isolation")) return { rows: [{ transaction_isolation: "serializable" }] };
      if (sql.includes("advisory-lock")) return { rows: [] };
      if (sql.includes("active-map-preflight")) return { rows: [] };
      if (sql.includes("insert-sys-file")) return { rows: JSON.parse(parameters[0]).map(row => ({ id: row.id })) };
      if (sql.includes("insert-record-map")) return { rows: JSON.parse(parameters[0]).map(row => ({ source_identity_sha256: row.source_identity_sha256 })) };
      if (sql.includes("lock-record-map")) return { rows: [{ source_identity_sha256: sha("runner-map"), target_id: "invalid" }] };
      throw new Error(`unexpected ${sql}`);
    } };
    return callback(tx);
  } };
}

function rollbackTransaction(files, { failure = null } = {}) {
  return async callback => callback({ async query(sql) {
    if (failure && sql.includes(failure)) throw new Error("rollback database failure");
    if (sql.includes("transaction-isolation")) return { rows: [{ transaction_isolation: "serializable" }] };
    if (sql.includes("lock-record-map")) return { rows: files.map(file => ({ source_identity_sha256: file.sourceIdentitySha256, target_id: file.id })) };
    if (sql.includes("delete-sys-file")) return { rows: files.map(file => ({ id: file.id })) };
    if (sql.includes("retire-record-map")) return { rows: files.map(file => ({ source_identity_sha256: file.sourceIdentitySha256 })) };
    throw new Error(`unexpected ${sql}`);
  } });
}

test("database persistence failure removes only the freshly materialized run directory", async () => {
  const db = transactional({ failure: "insert-record-map" }), input = materialization(1);
  await assert.rejects(runYuzhouPhotoFileRehearsal({ materialization: input, batchId: "00000000-0000-4000-8000-000000000001", tenantId: "fixture-tenant", parkId: "fixture-park", transaction: db.execute }));
  assert.equal(existsSync(join(storageRoot, "yuzhou-hr/t5-photo/runner-photo-1")), false);
  assert.equal(existsSync(join(storageRoot, ".yuzhou-photo-runner-photo-1.rollback")), false);
});

test("runner returns HOLD receipts after the only allowed materialization and persistence order", async () => {
  const db = transactional(), input = materialization(2);
  const result = await runYuzhouPhotoFileRehearsal({ materialization: input, batchId: "00000000-0000-4000-8000-000000000002", tenantId: "fixture-tenant", parkId: "fixture-park", transaction: db.execute });
  assert.equal(result.productionImport, "HOLD");
  assert.equal(result.receipt.files.length, 1);
  assert.equal(result.persistence.files.length, 1);
  assert(db.calls.findIndex(call => call.sql.includes("insert-sys-file")) < db.calls.findIndex(call => call.sql.includes("insert-record-map")));
});

test("successful rollback removes database metadata after staging files and leaves no run directory", async () => {
  const input = materialization(3);
  const created = await runYuzhouPhotoFileRehearsal({ materialization: input, batchId: "00000000-0000-4000-8000-000000000003", tenantId: "fixture-tenant", parkId: "fixture-park", transaction: transactional().execute });
  const result = await rollbackYuzhouPhotoFileRehearsalRun({ receipt: created.receipt, persistence: created.persistence, tenantId: "fixture-tenant", parkId: "fixture-park", storageRoot, transaction: rollbackTransaction(created.persistence.files) });
  assert.equal(result.productionImport, "HOLD");
  assert.equal(result.database.activeDatabaseRows, 0);
  assert.equal(result.files.binaryObjects, 0);
  assert.equal(existsSync(join(storageRoot, "yuzhou-hr/t5-photo/runner-photo-3")), false);
  assert.equal(existsSync(join(storageRoot, ".yuzhou-photo-runner-photo-3.rollback")), false);
});

test("rollback database failure restores the exact run directory instead of orphaning live metadata", async () => {
  const input = materialization(4);
  const created = await runYuzhouPhotoFileRehearsal({ materialization: input, batchId: "00000000-0000-4000-8000-000000000004", tenantId: "fixture-tenant", parkId: "fixture-park", transaction: transactional().execute });
  await assert.rejects(rollbackYuzhouPhotoFileRehearsalRun({ receipt: created.receipt, persistence: created.persistence, tenantId: "fixture-tenant", parkId: "fixture-park", storageRoot, transaction: rollbackTransaction(created.persistence.files, { failure: "delete-sys-file" }) }));
  assert.equal(existsSync(join(storageRoot, "yuzhou-hr/t5-photo/runner-photo-4")), true);
  assert.equal(existsSync(join(storageRoot, ".yuzhou-photo-runner-photo-4.rollback")), false);
});
