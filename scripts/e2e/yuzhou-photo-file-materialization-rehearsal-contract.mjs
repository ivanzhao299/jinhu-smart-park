#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test, { after } from "node:test";

import {
  YUZHOU_PHOTO_FILE_MATERIALIZATION_BIZ_TYPE,
  YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE,
  YuzhouPhotoFileMaterializationError,
  buildYuzhouPhotoFileMaterializationMetadata,
  materializeYuzhouPhotoFileRehearsal,
  rollbackYuzhouPhotoFileRehearsal
} from "../hr-cutover/yuzhou-photo-file-materialization-rehearsal.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const fixtureRoot = mkdtempSync(join(tmpdir(), "yuzhou-photo-file-materialization-"));
chmodSync(fixtureRoot, 0o700);
const stageRoot = join(fixtureRoot, "stage"), storageRoot = join(fixtureRoot, "storage");
mkdirSync(stageRoot, { mode: 0o700 });
mkdirSync(storageRoot, { mode: 0o700 });
chmodSync(stageRoot, 0o700); chmodSync(storageRoot, 0o700);
after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

function writeFixture(seed) {
  const bytes = Buffer.from(`synthetic-normalized-jpeg:${seed}`);
  const normalizedContentSha256 = sha(bytes);
  writeFileSync(join(stageRoot, `${normalizedContentSha256}.jpg`), bytes, { mode: 0o600 });
  chmodSync(join(stageRoot, `${normalizedContentSha256}.jpg`), 0o600);
  return {
    sourceIdentitySha256: sha(`identity:${seed}`),
    sourceContentSha256: sha(`source:${seed}`),
    normalizedContentSha256,
    employeeId: `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`,
    normalizedFile: `${normalizedContentSha256}.jpg`
  };
}

test("synthetic photo materialization writes only hash-addressed protected photo objects and rolls back exact files", async () => {
  const records = [writeFixture(1), writeFixture(2)];
  const receipt = await materializeYuzhouPhotoFileRehearsal({ mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, runId: "fixture-photo-a", stageRoot, storageRoot, records });
  assert.equal(receipt.productionImport, "HOLD");
  assert.equal(receipt.files.length, 2);
  for (const file of receipt.files) {
    assert.equal(file.bizType, YUZHOU_PHOTO_FILE_MATERIALIZATION_BIZ_TYPE);
    assert.equal(file.mimeType, "image/jpeg");
    assert.match(file.storagePath, /^yuzhou-hr\/t5-photo\/fixture-photo-a\/[0-9a-f]{64}\.jpg$/u);
    const entry = lstatSync(resolve(storageRoot, file.storagePath));
    assert.equal(entry.mode & 0o777, 0o600);
  }
  assert.deepEqual(readdirSync(join(storageRoot, receipt.storageRelativeDirectory)).sort(), receipt.files.map(row => `${row.normalizedContentSha256}.jpg`).sort());
  const rollback = await rollbackYuzhouPhotoFileRehearsal({ mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, runId: receipt.runId, storageRoot, files: receipt.files });
  assert.deepEqual(rollback, { mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, runId: "fixture-photo-a", productionImport: "HOLD", binaryObjects: 0 });
  assert.equal(existsSync(join(storageRoot, receipt.storageRelativeDirectory)), false);
});

test("materialization rejects a source hash mismatch without leaving a target run directory", async () => {
  const record = writeFixture(3);
  writeFileSync(join(stageRoot, record.normalizedFile), Buffer.from("tampered"), { mode: 0o600 });
  await assert.rejects(
    materializeYuzhouPhotoFileRehearsal({ mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, runId: "fixture-photo-b", stageRoot, storageRoot, records: [record] }),
    error => error instanceof YuzhouPhotoFileMaterializationError && error.code === "YUZHOU_PHOTO_FILE_MATERIALIZATION_NORMALIZED_HASH_MISMATCH"
  );
  assert.equal(existsSync(join(storageRoot, "yuzhou-hr/t5-photo/fixture-photo-b")), false);
  assert.equal(existsSync(join(storageRoot, ".yuzhou-photo-fixture-photo-b.tmp")), false);
});

test("rollback refuses a directory with files outside exact receipt metadata", async () => {
  const record = writeFixture(4);
  const receipt = await materializeYuzhouPhotoFileRehearsal({ mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, runId: "fixture-photo-c", stageRoot, storageRoot, records: [record] });
  const directory = join(storageRoot, receipt.storageRelativeDirectory);
  writeFileSync(join(directory, "unexpected.jpg"), Buffer.from("unexpected"), { mode: 0o600 });
  await assert.rejects(
    rollbackYuzhouPhotoFileRehearsal({ mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, runId: receipt.runId, storageRoot, files: receipt.files }),
    error => error instanceof YuzhouPhotoFileMaterializationError && error.code === "YUZHOU_PHOTO_FILE_MATERIALIZATION_ROLLBACK_RESIDUAL_UNSAFE"
  );
  assert.equal(existsSync(directory), true);
});

test("materialization rejects a generated parent symlink before changing or writing through it", async () => {
  const record = writeFixture(6);
  const symlinkStorageRoot = join(fixtureRoot, "symlink-storage");
  mkdirSync(symlinkStorageRoot, { mode: 0o700 }); chmodSync(symlinkStorageRoot, 0o700);
  const escaped = join(fixtureRoot, "escaped");
  mkdirSync(escaped, { mode: 0o700 }); chmodSync(escaped, 0o700);
  const namespace = join(symlinkStorageRoot, "yuzhou-hr");
  symlinkSync(escaped, namespace);
  await assert.rejects(
    materializeYuzhouPhotoFileRehearsal({ mode: YUZHOU_PHOTO_FILE_MATERIALIZATION_MODE, runId: "fixture-photo-e", stageRoot, storageRoot: symlinkStorageRoot, records: [record] }),
    error => error instanceof YuzhouPhotoFileMaterializationError && error.code === "YUZHOU_PHOTO_FILE_MATERIALIZATION_TARGET_DIRECTORY_UNSAFE"
  );
  assert.equal(readdirSync(escaped).length, 0);
});

test("metadata is bound to a single synthetic run and rejects non-rehearsal semantics", () => {
  const record = writeFixture(5);
  const metadata = buildYuzhouPhotoFileMaterializationMetadata({ runId: "fixture-photo-d", record });
  assert.deepEqual(Object.keys(metadata).sort(), ["bizId", "bizType", "mimeType", "normalizedContentSha256", "sourceContentSha256", "sourceIdentitySha256", "storagePath"]);
  assert.throws(
    () => buildYuzhouPhotoFileMaterializationMetadata({ runId: "bad", record }),
    error => error instanceof YuzhouPhotoFileMaterializationError && error.code === "YUZHOU_PHOTO_FILE_MATERIALIZATION_RUN_ID_INVALID"
  );
});
