import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, rmSync, chmodSync, unlinkSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { YUZHOU_T0_EXTRACT_LAYOUT as LAYOUT } from "../hr-cutover/yuzhou-t0-extract-layout.mjs";
import { verifyYuzhouRetainedT0Files as verify } from "../hr-cutover/verify-yuzhou-retained-t0-files.mjs";
const hash = b => createHash("sha256").update(b).digest("hex");
function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "retained-t0-test-")));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const domains = {}, files = new Map();
  for (const [domain, { file }] of Object.entries(LAYOUT)) {
    const bytes = domain === "positions" ? "" : "{\"synthetic\":true}\n";
    writeFileSync(join(directory, file), bytes, { mode: 0o600 }); files.set(file, bytes);
    domains[domain] = { rows: bytes ? 1 : 0, file, fileSha256: hash(bytes) };
  }
  const manifest = { formatVersion: 1, generatedAt: "2026-09-09T00:00:00Z", domains };
  const save = () => { const b = JSON.stringify(manifest); writeFileSync(join(directory, "manifest.json"), b, { mode: 0o600 }); return { directory, manifestSha256: hash(b) }; };
  return { directory, manifest, save, files };
}
test("six pinned files, including empty table, verified without source or row-count claims", t => {
  const f = fixture(t), result = verify(f.save());
  assert.equal(result.status, "RETAINED_T0_CONTENT_VERIFIED"); assert.equal(result.files.length, 6);
  assert.equal(result.files.find(x => x.domain === "positions").bytes, 0);
  assert.equal(result.lifecycleReady, false); assert.equal(result.sourceBindingVerified, false); assert.equal(result.rowCountsVerified, false);
  assert.ok(!JSON.stringify(result).includes(f.directory)); assert.ok(!JSON.stringify(result).includes("synthetic"));
  for (const [file, bytes] of f.files) assert.equal(readFileSync(join(f.directory, file), "utf8"), bytes);
});
for (const defect of ["hash", "missing", "extra-domain", "wrong-file", "negative-rows", "unsafe-file", "symlink", "manifest-pin"]) test(`reject ${defect} without content leakage`, t => {
  const f = fixture(t);
  if (defect === "extra-domain") f.manifest.domains.extra = {};
  if (defect === "wrong-file") f.manifest.domains.employees.file = "../PRIVATE";
  if (defect === "negative-rows") f.manifest.domains.employees.rows = -1;
  const input = f.save(), p = join(f.directory, "employees.jsonl");
  if (defect === "hash") writeFileSync(p, "PRIVATE");
  if (defect === "missing") unlinkSync(p);
  if (defect === "unsafe-file") chmodSync(p, 0o644);
  if (defect === "symlink") { unlinkSync(p); symlinkSync(join(f.directory, "departments.jsonl"), p); }
  if (defect === "manifest-pin") input.manifestSha256 = hash("wrong");
  assert.throws(() => verify(input), e => e.message === "RETAINED_T0_FILES_INVALID");
});
