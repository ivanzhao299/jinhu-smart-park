#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  deriveYuzhouPhotoFileId,
  persistYuzhouPhotoFileRehearsal,
  rollbackYuzhouPhotoFileRehearsalPersistence
} from "../hr-cutover/yuzhou-photo-file-rehearsal-persistence.mjs";
import { YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, YuzhouPhotoFileMaterializationError } from "../hr-cutover/yuzhou-photo-file-materialization-rehearsal.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const batchId = "00000000-0000-4000-8000-000000000001";
const row = seed => ({ bizId: "00000000-0000-4000-8000-000000000010", bizType: "hr_employee_photo", mimeType: "image/jpeg", sourceIdentitySha256: sha(`identity:${seed}`), sourceRowSha256: sha(`row:${seed}`), sourceContentSha256: sha(`source:${seed}`), normalizedContentSha256: sha(`normalized:${seed}`), storagePath: `yuzhou-hr/t5-photo/fixture-run/${sha(`normalized:${seed}`)}.jpg`, fileSize: 12, md5: createHash("md5").update(`jpeg:${seed}`).digest("hex") });
const input = (tx, files = [row(1), row(2)]) => ({ mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, batchId, tenantId: "fixture-tenant", parkId: "fixture-park", files, tx });

function tx({ existing = [], maps = null, deleted = null, retired = null } = {}) {
  const calls = [];
  return { calls, async query(sql, parameters) {
    calls.push({ sql, parameters });
    if (sql.includes("transaction-isolation")) return { rows: [{ transaction_isolation: "serializable" }] };
    if (sql.includes("advisory-lock")) return { rows: [] };
    if (sql.includes("active-map-preflight")) return { rows: existing };
    if (sql.includes("insert-sys-file")) return { rows: JSON.parse(parameters[0]).map(row => ({ id: row.id })) };
    if (sql.includes("insert-record-map")) return { rows: JSON.parse(parameters[0]).map(row => ({ source_identity_sha256: row.source_identity_sha256 })) };
    if (sql.includes("lock-record-map")) return { rows: maps ?? [row(1), row(2)].map(file => ({ source_identity_sha256: file.sourceIdentitySha256, target_id: deriveYuzhouPhotoFileId(file.sourceIdentitySha256) })) };
    if (sql.includes("delete-sys-file")) return { rows: deleted ?? [row(1), row(2)].map(file => ({ id: deriveYuzhouPhotoFileId(file.sourceIdentitySha256) })) };
    if (sql.includes("retire-record-map")) return { rows: retired ?? [row(1), row(2)].map(file => ({ source_identity_sha256: file.sourceIdentitySha256 })) };
    throw new Error(`unexpected query ${sql}`);
  } };
}

test("persistence locks source identities then writes only protected sys_file and exact active record maps", async () => {
  const database = tx();
  const receipt = await persistYuzhouPhotoFileRehearsal(input(database));
  assert.equal(receipt.productionImport, "HOLD");
  assert.equal(receipt.files.length, 2);
  assert.match(receipt.files[0].id, /^[0-9a-f-]{36}$/u);
  assert.equal(database.calls.length, 5);
  assert(database.calls[0].sql.includes("SHOW transaction_isolation"));
  assert(database.calls[1].sql.includes("pg_advisory_xact_lock"));
  assert(database.calls[3].sql.includes("INSERT INTO sys_file"));
  assert(database.calls[4].sql.includes("INSERT INTO legacy_record_map"));
  assert.doesNotMatch(database.calls[3].sql, /hr_employee_document|hr_employee|payslip|biz_user_message/u);
});

test("active source replay is rejected before sys_file writes", async () => {
  const database = tx({ existing: [{ source_identity_sha256: sha("existing") }] });
  await assert.rejects(persistYuzhouPhotoFileRehearsal(input(database)), error => error instanceof YuzhouPhotoFileMaterializationError && error.code === "YUZHOU_PHOTO_FILE_PERSISTENCE_REPLAY_CONFLICT");
  assert.equal(database.calls.some(call => call.sql.includes("insert-sys-file")), false);
});

test("database rollback accepts only the exact batch maps then removes metadata before retiring maps", async () => {
  const database = tx();
  const result = await rollbackYuzhouPhotoFileRehearsalPersistence(input(database));
  assert.deepEqual(result, { productionImport: "HOLD", batchId, activeDatabaseRows: 0 });
  assert.equal(database.calls.length, 4);
  assert(database.calls[2].sql.includes("DELETE FROM sys_file"));
  assert(database.calls[3].sql.includes("mapping_status='rolled_back'"));
});

test("rollback rejects a map scope drift before deleting sys_file", async () => {
  const database = tx({ maps: [] });
  await assert.rejects(rollbackYuzhouPhotoFileRehearsalPersistence(input(database)), error => error instanceof YuzhouPhotoFileMaterializationError && error.code === "YUZHOU_PHOTO_FILE_PERSISTENCE_ROLLBACK_SCOPE_INVALID");
  assert.equal(database.calls.some(call => call.sql.includes("delete-sys-file")), false);
});

test("non-serializable persistence is rejected before advisory locks or writes", async () => {
  const database = tx();
  database.query = async sql => {
    database.calls.push({ sql, parameters: [] });
    if (sql.includes("transaction-isolation")) return { rows: [{ transaction_isolation: "read committed" }] };
    throw new Error("no later database action expected");
  };
  await assert.rejects(persistYuzhouPhotoFileRehearsal(input(database)), error => error instanceof YuzhouPhotoFileMaterializationError && error.code === "YUZHOU_PHOTO_FILE_PERSISTENCE_ISOLATION_INVALID");
  assert.equal(database.calls.length, 1);
});
