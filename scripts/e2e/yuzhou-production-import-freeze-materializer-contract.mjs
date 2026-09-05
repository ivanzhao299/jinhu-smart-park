import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import {
  PRODUCTION_IMPORT_CANDIDATE_FREEZE_DEPENDENCY_PATHS,
  currentCandidateFreezeRepositorySha,
  materializeProductionImportFrozenDecisions as materialize,
} from "../hr-cutover/materialize-production-import-frozen-decisions.mjs";
import { bridgeProductionImportRealArtifacts } from "../hr-cutover/production-import-real-artifact-bridge.mjs";
import { fixture, inputFor, quarantine, hash } from "./yuzhou-production-import-candidate-freeze-fixture.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = join(root, "scripts/hr-cutover/materialize-production-import-frozen-decisions.mjs");
function privateFixture(t, f = fixture()) {
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "yuzhou-freeze-synthetic-")));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const inputs = join(dir, "inputs"), output = join(dir, "outputs");
  fs.mkdirSync(inputs, { mode: 0o700 }); fs.mkdirSync(output, { mode: 0o700 });
  const pure = inputFor(f);
  const put = (name, descriptor) => {
    if (descriptor === null) return null;
    const path = join(inputs, name); fs.writeFileSync(path, descriptor.bytes, { mode: 0o600 });
    return { path, sha256: descriptor.sha256 };
  };
  const config = { formatVersion: 1, triple: f.triple, outputDir: output, artifacts: {
    phases: Object.fromEntries(Object.entries(pure.phaseArtifacts).map(([phase, item]) => [phase, put(`${phase}-phase.json`, item)])),
    candidates: Object.fromEntries(Object.entries(pure.candidateArtifacts).map(([phase, item]) => [phase, put(`${phase}-candidates.json`, item)])),
    targetInventory: put("inventory.json", pure.targetInventoryArtifact), targetScope: put("scope.json", pure.targetScopeArtifact), reviewedDecisions: put("reviews.json", pure.reviewedDecisionsArtifact) } };
  const path = join(inputs, "config.json");
  const save = () => fs.writeFileSync(path, JSON.stringify(config), { mode: 0o600 }); save();
  return { dir, inputs, output, config, path, save, options: { currentHead: () => f.triple.codeSha } };
}
const reject = action => assert.throws(action, error => /^(FREEZE_MATERIALIZER|CANDIDATE_FREEZE)_[A-Z0-9_]+$/u.test(error.code) && error.code === error.message);
function patch(t, key, fn) {
  const original = fs[key]; fs[key] = fn(original); syncBuiltinESMExports();
  t.after(() => { fs[key] = original; syncBuiltinESMExports(); });
}
function repositoryFixture(t) {
  const repository = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "yuzhou-freeze-git-synthetic-")));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  const git = args => execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(["init", "--quiet"]);
  for (const dependency of PRODUCTION_IMPORT_CANDIDATE_FREEZE_DEPENDENCY_PATHS) {
    const path = join(repository, dependency);
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, "synthetic tracked dependency\n");
  }
  git(["add", "--", ...PRODUCTION_IMPORT_CANDIDATE_FREEZE_DEPENDENCY_PATHS]);
  git(["-c", "user.name=Candidate Freeze Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false", "commit", "--quiet", "-m", "synthetic candidate"]);
  return { repository, git };
}
test("candidate code gate requires every runtime dependency to be tracked and the repository to be clean", async t => {
  await t.test("clean tracked candidate passes", t => {
    const value = repositoryFixture(t);
    assert.equal(currentCandidateFreezeRepositorySha(value.repository), value.git(["rev-parse", "HEAD"]));
  });
  await t.test("unstaged tracked change fails", t => {
    const value = repositoryFixture(t);
    fs.appendFileSync(join(value.repository, PRODUCTION_IMPORT_CANDIDATE_FREEZE_DEPENDENCY_PATHS[0]), "dirty\n");
    reject(() => currentCandidateFreezeRepositorySha(value.repository));
  });
  await t.test("staged tracked change fails", t => {
    const value = repositoryFixture(t), dependency = PRODUCTION_IMPORT_CANDIDATE_FREEZE_DEPENDENCY_PATHS[0];
    fs.appendFileSync(join(value.repository, dependency), "staged\n");
    value.git(["add", "--", dependency]);
    reject(() => currentCandidateFreezeRepositorySha(value.repository));
  });
  await t.test("untracked runtime dependency fails", t => {
    const value = repositoryFixture(t), dependency = PRODUCTION_IMPORT_CANDIDATE_FREEZE_DEPENDENCY_PATHS[0];
    value.git(["rm", "--cached", "--quiet", "--", dependency]);
    value.git(["-c", "user.name=Candidate Freeze Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false", "commit", "--quiet", "-m", "remove runtime dependency"]);
    reject(() => currentCandidateFreezeRepositorySha(value.repository));
  });
});
test("private CLI owner writes verified role wrappers and receipt last; persisted wrappers roundtrip to existing bridge", t => {
  const x = privateFixture(t), original = fs.readFileSync(x.config.artifacts.candidates.T3.path);
  const writes = [];
  patch(t, "openSync", original => (path, flags, ...rest) => { if (flags & fs.constants.O_CREAT) writes.push(path); return original(path, flags, ...rest); });
  const result = materialize(x.path, x.options);
  assert.equal(result.status, "READY"); assert.equal(result.productionImport, "HOLD");
  assert.equal(writes.at(-1), join(x.output, "candidate-freeze-receipt.json"));
  assert.deepEqual(fs.readFileSync(x.config.artifacts.candidates.T3.path), original);
  const receipt = JSON.parse(fs.readFileSync(writes.at(-1), "utf8"));
  for (const [file, descriptor] of Object.entries(receipt.artifacts)) {
    const bytes = fs.readFileSync(join(x.output, file)); assert.equal(hash(bytes), descriptor.sha256); assert.equal(bytes.length, descriptor.bytes);
    assert.equal(fs.statSync(join(x.output, file)).mode & 0o777, 0o600);
  }
  const read = path => { const bytes = fs.readFileSync(path); return { path, bytes, sha256: hash(bytes) }; };
  const bridge = bridgeProductionImportRealArtifacts({ expectedTriple: x.config.triple,
    phaseArtifacts: Object.values(x.config.artifacts.phases).map(d => read(d.path)),
    decisionsArtifact: read(join(x.output, "real-decisions.json")), targetInventoryArtifact: read(join(x.output, "real-inventory.json")), sealedScopeArtifact: read(join(x.output, "real-scope.json")) });
  assert.equal(bridge.status, "READY"); reject(() => materialize(x.path, x.options));
});
test("missing review emits only retained HOLD evidence and aggregate receipt", t => {
  const f = fixture(); quarantine(f, "hr_employee_insurance_item", true);
  const x = privateFixture(t, f), out = materialize(x.path, x.options);
  assert.equal(out.missingReviewCount, 1); assert.equal(out.status, "REVIEW_HOLD");
  assert.deepEqual(fs.readdirSync(x.output).sort(), ["candidate-freeze-receipt.json", "candidate-preparation-evidence.json"]);
  assert.doesNotMatch(JSON.stringify(out), /sourceIdentitySha256|targetFields|attestationBase64|synthetic-tenant/);
});
test("permissions, hardlinks, symlinks, byte hashes and bounded input/output fail before output", async t => {
  const cases = [
    x => fs.chmodSync(x.config.artifacts.candidates.T0.path, 0o644),
    x => fs.linkSync(x.config.artifacts.candidates.T0.path, join(x.inputs, "hardlink.json")),
    x => { const d = x.config.artifacts.candidates.T0; fs.renameSync(d.path, d.path + ".original"); fs.symlinkSync(d.path + ".original", d.path); },
    x => fs.chmodSync(x.output, 0o755),
    x => { x.config.artifacts.candidates.T0.sha256 = hash("stale bytes"); x.save(); },
    x => { x.options.maximumReadBytes = 10; },
    x => { x.options.maximumOutputBytes = 10; },
    x => { x.options.maximumTotalOutputBytes = 10; },
    x => { x.options.maximumReadBytes = 1024 ** 3 + 1; },
    x => { x.options.maximumOutputBytes = 384 * 1024 ** 2 + 1; },
    x => { x.options.currentHead = () => "b".repeat(40); },
    x => fs.writeFileSync(x.path, Buffer.from([0xff])),
  ];
  for (const [index, change] of cases.entries()) await t.test(`negative ${index}`, t => {
    const x = privateFixture(t); change(x); reject(() => materialize(x.path, x.options)); assert.equal(fs.readdirSync(x.output).length, 0);
  });
});
test("short writes are completed and every artifact is fsynced", t => {
  const x = privateFixture(t); let syncs = 0;
  patch(t, "writeSync", original => (fd, buffer, offset, length) => original(fd, buffer, offset, Math.min(7, length)));
  patch(t, "fsyncSync", original => fd => { syncs++; return original(fd); });
  assert.equal(materialize(x.path, x.options).status, "READY"); assert.ok(syncs >= 7);
});
test("a race after authenticated read is rejected without a receipt", t => {
  const x = privateFixture(t); let changed = false;
  patch(t, "readSync", original => (fd, buffer, offset, length, position) => {
    const count = original(fd, buffer, offset, length, position);
    if (!changed && length === 1 && count === 0) { changed = true; fs.appendFileSync(x.path, " "); }
    return count;
  });
  reject(() => materialize(x.path, x.options)); assert.equal(fs.existsSync(join(x.output, "candidate-freeze-receipt.json")), false);
});
test("output write failure preserves reservations and never creates a success receipt", t => {
  const x = privateFixture(t);
  patch(t, "writeSync", () => () => { throw new Error("private path and source value must not leak"); });
  reject(() => materialize(x.path, x.options));
  assert.ok(fs.readdirSync(x.output).length >= 1); assert.equal(fs.existsSync(join(x.output, "candidate-freeze-receipt.json")), false);
});
test("failed receipt sync removes only this run's completion marker and preserves data", t => {
  const x = privateFixture(t); let markerFd;
  patch(t, "openSync", original => (path, flags, ...rest) => { const fd = original(path, flags, ...rest); if (path === join(x.output, "candidate-freeze-receipt.json") && flags & fs.constants.O_CREAT) markerFd = fd; return fd; });
  patch(t, "fsyncSync", original => fd => { if (fd === markerFd) throw new Error("synthetic sync failure"); return original(fd); });
  reject(() => materialize(x.path, x.options));
  assert.equal(fs.existsSync(join(x.output, "candidate-freeze-receipt.json")), false); assert.equal(fs.readdirSync(x.output).length, 4);
});
test("corrupted output readback fails without completing the receipt", t => {
  const x = privateFixture(t); let targetFd;
  patch(t, "openSync", original => (path, flags, ...rest) => { const fd = original(path, flags, ...rest); if (path === join(x.output, "real-decisions.json") && !(flags & fs.constants.O_CREAT)) targetFd = fd; return fd; });
  patch(t, "readSync", original => (fd, buffer, offset, length, position) => { const count = original(fd, buffer, offset, length, position); if (fd === targetFd && count) buffer[offset] ^= 1; return count; });
  reject(() => materialize(x.path, x.options)); assert.equal(fs.existsSync(join(x.output, "candidate-freeze-receipt.json")), false);
});
test("a replaced completion marker is preserved during failure rollback", t => {
  const x = privateFixture(t); let markerFd, changed = false;
  patch(t, "openSync", original => (path, flags, ...rest) => { const fd = original(path, flags, ...rest); if (path === join(x.output, "candidate-freeze-receipt.json") && flags & fs.constants.O_CREAT) markerFd = fd; return fd; });
  patch(t, "fsyncSync", original => fd => {
    if (fd === markerFd && !changed) {
      changed = true; const path = join(x.output, "candidate-freeze-receipt.json");
      fs.renameSync(path, join(x.output, "failed-marker.json")); fs.writeFileSync(path, "other owner marker", { mode: 0o600 });
      throw new Error("synthetic replacement");
    }
    return original(fd);
  });
  reject(() => materialize(x.path, x.options)); assert.equal(fs.readFileSync(join(x.output, "candidate-freeze-receipt.json"), "utf8"), "other owner marker");
});
test("an unexpected output created during receipt completion prevents a success marker", t => {
  const x = privateFixture(t); let markerFd, added = false;
  patch(t, "openSync", original => (path, flags, ...rest) => { const fd = original(path, flags, ...rest); if (path === join(x.output, "candidate-freeze-receipt.json") && flags & fs.constants.O_CREAT) markerFd = fd; return fd; });
  patch(t, "fsyncSync", original => fd => {
    const result = original(fd);
    if (fd === markerFd && !added) {
      added = true;
      fs.writeFileSync(join(x.output, "unexpected-output.json"), "synthetic concurrent output", { mode: 0o600 });
    }
    return result;
  });
  reject(() => materialize(x.path, x.options));
  assert.equal(fs.existsSync(join(x.output, "candidate-freeze-receipt.json")), false);
  assert.equal(fs.existsSync(join(x.output, "unexpected-output.json")), true);
});
test("CLI accepts only config and sanitizes failure output", t => {
  const x = privateFixture(t);
  const result = spawnSync(process.execPath, [cli, "--config", x.path, "--current-head", "a".repeat(40)], { encoding: "utf8" });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.equal(result.stderr, "FREEZE_MATERIALIZER_ARGUMENT_INVALID\n");
  const stale = spawnSync(process.execPath, [cli, "--config", x.path], { encoding: "utf8" });
  assert.equal(stale.status, 1); assert.equal(stale.stdout, ""); assert.equal(stale.stderr, "FREEZE_MATERIALIZER_CURRENT_CODE_REQUIRED\n");
});
