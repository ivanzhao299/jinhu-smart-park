import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { checkRetentionRoot, retainVerifiedBackup, validateRetentionInput } from "../retain-production-gate-backup.mjs";

const repo = realpathSync(join(dirname(fileURLToPath(import.meta.url)), "../.."));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const payload = { database: Buffer.from("synthetic database archive"), files: Buffer.from("synthetic file archive") };
const input = () => ({ runId: "gate19-test", artifacts: ["database", "files"].map(kind => ({ kind, bytes: payload[kind].length, sha256: digest(payload[kind]) })) });
function fixture(t) {
  // Private repository ancestor avoids /tmp's deliberately writable ancestors.
  const mount = mkdtempSync(join(repo, ".backup-retention-test-"));
  t.after(() => rmSync(mount, { recursive: true, force: true }));
  const root = checkRetentionRoot(mount, () => {});
  let aborted = 0;
  const options = { root, freeBytes: 30n * 1024n ** 3n, timeoutMs: 500,
    openSource: kind => ({ stream: Readable.from([payload[kind]]), completed: Promise.resolve(), abort: () => { aborted += 1; } }) };
  return { mount, root, options, abortCount: () => aborted };
}

test("retains exact bytes, private modes, verified receipt and independent repeated runs", async t => {
  const { root, options } = fixture(t);
  const first = await retainVerifiedBackup(input(), options);
  const second = await retainVerifiedBackup(input(), options);
  assert.notEqual(first.backupId, second.backupId);
  for (const receipt of [first, second]) {
    const directory = join(root, receipt.backupId);
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    for (const [kind, name] of [["database", "database.dump"], ["files", "files.tgz"]]) {
      assert.deepEqual(readFileSync(join(directory, name)), payload[kind]);
      assert.equal(statSync(join(directory, name)).mode & 0o777, 0o600);
    }
    const bytes = readFileSync(join(directory, "receipt.json"));
    assert.equal(digest(bytes), receipt.receiptSha256);
    assert.equal(statSync(join(directory, "receipt.json")).mode & 0o777, 0o600);
    assert.equal(JSON.parse(bytes).status, "RETAINED_HASH_VERIFIED");
    assert.equal(JSON.parse(bytes).backupId, receipt.backupId);
    assert.equal(JSON.parse(bytes).runId, input().runId);
    assert.deepEqual(JSON.parse(bytes).artifacts, input().artifacts);
    assert.equal(JSON.parse(bytes).productionImport, "HOLD");
    assert.equal(JSON.parse(bytes).fullDisasterRecoveryClaimed, false);
    assert.equal(existsSync(join(directory, "receipt.pending.json")), false);
    assert.equal(JSON.stringify(receipt).includes(root), false);
  }
});

test("invalid manifest rejected before any destination file", async t => {
  const { root, options } = fixture(t);
  const variants = [null, {}, { ...input(), extra: true }, ...["../escape", "-test", "x".repeat(81), "test\n", ["gate19"], 123].map(runId => ({ ...input(), runId }))];
  for (const field of [{ bytes: 0 }, { bytes: -1 }, { bytes: 21 * 1024 ** 3 }, { bytes: 1.5 }, { sha256: "bad" }, { sha256: ["a".repeat(64)] }, { kind: "files" }, { extra: true }]) {
    const next = input(); Object.assign(next.artifacts[0], field); variants.push(next);
  }
  for (const value of variants) {
    assert.throws(() => validateRetentionInput(value), { code: "BACKUP_RETENTION_INPUT_INVALID" });
    await assert.rejects(retainVerifiedBackup(value, options), { code: "BACKUP_RETENTION_INPUT_INVALID" });
  }
  assert.deepEqual(readdirSync(root), []);
});

test("disk reserve includes both artifacts and refuses before copy", async t => {
  const { root, options } = fixture(t);
  await assert.rejects(retainVerifiedBackup(input(), { ...options, freeBytes: 20n * 1024n ** 3n,
    openSource: () => assert.fail("must not open source") }), { code: "BACKUP_RETENTION_DISK_GUARD" });
  assert.deepEqual(readdirSync(root), []);
});

test("mount check failure, symlink and writable ancestors or root fail closed", t => {
  const { mount, root } = fixture(t);
  assert.throws(() => checkRetentionRoot(mount, () => { throw new Error("missing mount"); }), /missing mount/u);
  const link = join(mount, "link"); symlinkSync(root, link);
  assert.throws(() => checkRetentionRoot(link, () => {}), { code: "BACKUP_RETENTION_PATH_UNSAFE" });
  chmodSync(root, 0o755);
  assert.throws(() => checkRetentionRoot(mount, () => {}), { code: "BACKUP_RETENTION_PATH_UNSAFE" });
  chmodSync(root, 0o700);
  const nested = join(mount, "nested"); mkdirSync(nested, { mode: 0o700 });
  chmodSync(mount, 0o777);
  assert.throws(() => checkRetentionRoot(nested, () => {}), { code: "BACKUP_RETENTION_PATH_UNSAFE" });
  chmodSync(mount, 0o700);
});

for (const mode of ["hash", "short", "long", "child-failed", "child-never-settles", "stream-failed", "stream-never-ends"]) {
  test(`copy ${mode} preserves private partials without success receipt`, async t => {
    const { root, options, abortCount } = fixture(t);
    const original = options.openSource;
    options.openSource = kind => {
      const source = original(kind);
      if (mode === "hash") source.stream = Readable.from([Buffer.alloc(payload[kind].length)]);
      if (mode === "short") source.stream = Readable.from([payload[kind].subarray(1)]);
      if (mode === "long") source.stream = Readable.from([payload[kind], Buffer.from("extra")]);
      if (mode === "child-failed") source.completed = Promise.reject(new Error("synthetic failure"));
      if (mode === "child-never-settles") source.completed = new Promise(() => {});
      if (mode === "stream-failed") source.stream = Readable.from((async function* () { yield Buffer.from("partial"); throw new Error("synthetic stream failure"); })());
      if (mode === "stream-never-ends") source.stream = new Readable({ read() {} });
      return source;
    };
    options.timeoutMs = 80;
    await assert.rejects(retainVerifiedBackup(input(), options), { code: "BACKUP_RETENTION_COPY_FAILED" });
    assert.equal(abortCount(), 1);
    const directories = readdirSync(root); assert.equal(directories.length, 1);
    const directory = join(root, directories[0]);
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(existsSync(join(directory, "receipt.json")), false);
    for (const name of readdirSync(directory)) assert.equal(statSync(join(directory, name)).mode & 0o777, 0o600);
  });
}

test("second artifact failure preserves verified database bytes without publishing success", async t => {
  const { root, options, abortCount } = fixture(t);
  const original = options.openSource;
  options.openSource = kind => {
    const source = original(kind);
    if (kind === "files") source.stream = Readable.from([Buffer.alloc(payload.files.length)]);
    return source;
  };
  await assert.rejects(retainVerifiedBackup(input(), options), { code: "BACKUP_RETENTION_COPY_FAILED" });
  assert.equal(abortCount(), 1);
  const directories = readdirSync(root);
  assert.equal(directories.length, 1);
  const directory = join(root, directories[0]);
  assert.deepEqual(readFileSync(join(directory, "database.dump")), payload.database);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  for (const name of readdirSync(directory)) assert.equal(statSync(join(directory, name)).mode & 0o777, 0o600);
  assert.equal(existsSync(join(directory, "receipt.json")), false);
  assert.equal(existsSync(join(directory, "receipt.pending.json")), false);
});

test("workflow opt-in and restore-before-retain ordering; cleanup excludes retained root", () => {
  const gate = readFileSync(join(repo, "scripts/production-backup-restore-gate19.sh"), "utf8");
  const workflow = readFileSync(join(repo, ".github/workflows/production-backup-restore-gate.yml"), "utf8");
  assert.match(workflow, /retain_verified_backup:[\s\S]*?type: boolean[\s\S]*?default: false/u);
  assert.match(gate, /requested_retention="\$\{RETAIN_VERIFIED_BACKUP:-no\}"/u);
  assert.ok(gate.indexOf('RETAIN_VERIFIED_BACKUP="$requested_retention"') > gate.indexOf('. "$ENV_FILE"'));
  assert.ok(gate.indexOf('mjs" check') < gate.indexOf("pg_dump -U"));
  assert.ok(gate.indexOf('mjs" retain') > gate.indexOf("## Safety Evidence"));
  assert.ok(gate.indexOf("BACKUP_RETENTION_RUN_ID_INVALID") < gate.indexOf("trap "));
  assert.doesNotMatch(gate, /rm[^\n]*(?:hr-preimport-backups|backupId)/u);
  assert.match(gate, /HASH_OUTPUT=.*sha256sum.*\|\| fail_gate/u);
});
