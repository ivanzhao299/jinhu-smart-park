import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { hashT4 } from "../hr-cutover/production-import-t4-followon-binding.mjs";
import { T5_API_PHOTO_STORAGE_SCRIPT } from "../hr-cutover/t5-followon-photo-container-storage.mjs";

test("the exact API container storage program writes, verifies and removes only its operation", () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-t5-photo-storage-"));
  const bytes = Buffer.from([255, 216, 255, 1, 255, 217]), sha = hashT4(bytes);
  const prepared = { directory: "yuzhou-hr/t5-photo/yzprod-import-20261001T000000Z-aaaaaaaaaaaa",
    images: [{ normalizedContentSha256: sha, bytes: bytes.length, base64: bytes.toString("base64") }] };
  const run = (mode, value = prepared) => {
    const result = spawnSync(process.execPath, ["-e", T5_API_PHOTO_STORAGE_SCRIPT], {
      input: JSON.stringify({ mode, prepared: value }), encoding: "utf8", env: { ...process.env, FILE_STORAGE_LOCAL_ROOT: root } });
    return { status: result.status, response: JSON.parse(result.stdout) };
  };
  try {
    const prior = join(root, "prior-user-upload"); writeFileSync(prior, "preserve");
    assert.deepEqual(run("put").response, { status: "PASS", verified: null });
    assert.equal(run("verify").response.verified, true);
    assert.equal(run("put").status, 1, "replay cannot overwrite existing operation");
    assert.equal(run("remove", { ...prepared, directory: "../outside" }).response.code, "T5_PHOTO_STORAGE_PATH_INVALID");
    const file = join(root, prepared.directory, `${sha}.jpg`); writeFileSync(file, "changed");
    assert.equal(run("verify").response.verified, false);
    assert.equal(run("remove").response.code, "T5_PHOTO_STORAGE_DRIFT");
    writeFileSync(file, bytes); assert.equal(run("remove").response.status, "PASS");
    assert.equal(readFileSync(prior, "utf8"), "preserve");
  } finally { rmSync(root, { recursive: true }); }
});
