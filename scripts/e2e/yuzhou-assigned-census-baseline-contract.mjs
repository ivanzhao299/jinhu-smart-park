/* global Buffer, structuredClone */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { fixture } from "./production-import-plan-test-fixture.mjs";
import { CENSUS_TABLES, CENSUS_FILE, censusHash as hash, censusIdHash, censusTableHash } from "../hr-cutover/production-import-id-census.mjs";
import { stableProductionImportCanonicalJson as canonical } from "../hr-cutover/production-import-target-model.mjs";
import { materializeAssignedScopeCensusBaseline } from "../hr-cutover/materialize-production-import-assigned-census-baseline.mjs";
import { ASSIGNED_CENSUS_EXECUTOR_SHA, ASSIGNED_CENSUS_ARTIFACT as CENSUS_ARTIFACT } from "../hr-cutover/production-import-assigned-scope-id-census.mjs";
import { DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT as CONTRACT } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
const target = CONTRACT.activation.allowedTargets[0], authorizedScope = { tenantId: "10000001", parkId: "20000001", scopeSha256: target.targetScopeSha256 };
const NOW = new Date("2026-09-09T01:00:00Z");

function setup(t) {
  const f = fixture(t), appTriple = { ...f.triple, codeSha: ASSIGNED_CENSUS_EXECUTOR_SHA }, census = { formatVersion: 1, kind: "yuzhou_global_id_census_v1", targetIdentitySha256: target.identitySha256,
    targetScopeSha256: authorizedScope.scopeSha256, observedAt: "2026-09-09T00:30:00Z", expiresAt: "2026-09-09T01:30:00Z", scopeCounts: { assigned: 3, valid: 3 }, selection: { scopeSha256: authorizedScope.scopeSha256, assigned: 1, valid: 1 },
    tables: Object.fromEntries(CENSUS_TABLES.map(table => [table, { count: 0, hashes: [], sha256: censusTableHash(table, []) }])), complete: true, productionImport: "HOLD" };
  const provenance = { runId: "123", runAttempt: "1", artifactId: "456", observerCodeSha: f.triple.codeSha, executorCodeSha: ASSIGNED_CENSUS_EXECUTOR_SHA }, outputDir = join(f.root, "census-baseline"); mkdirSync(outputDir, { mode: 0o700 });
  const config = { formatVersion: 1, triple: appTriple, targetIdentitySha256: target.identitySha256, targetScope: authorizedScope, provenance,
    phases: Object.fromEntries(Object.entries(f.config.artifacts.phases).map(([p, v]) => [p, v.records])), outputDir };
  const workflow = { repository: "ivanzhao299/jinhu-smart-park", runId: "123", runAttempt: "1", observerCodeSha: f.triple.codeSha };
  const envelope = { formatVersion: 1, kind: "yuzhou_assigned_scope_workflow_id_census_v1", triple: appTriple, workflow, census, censusSha256: "", productionImport: "HOLD" };
  const run = { id: 123, run_attempt: 1, head_sha: f.triple.codeSha, head_branch: "codex/yuzhou-private-import-transport-20261001", event: "workflow_dispatch", status: "completed", conclusion: "success", path: ".github/workflows/deploy-production.yml", repository: { full_name: workflow.repository }, run_started_at: "2026-09-09T00:29:00Z" };
  const zip = Buffer.from("synthetic archive transport"), artifact = { id: 456, name: CENSUS_ARTIFACT, expired: false, workflow_run: { id: 123, head_sha: f.triple.codeSha }, digest: `sha256:${hash(zip)}`, size_in_bytes: zip.length, created_at: "2026-09-09T00:31:00Z" };
  let listing = CENSUS_FILE; const calls = [];
  const command = (file, args) => {
    calls.push([file, args]);
    if (file === "gh") {
      assert.deepEqual(args.slice(0, 3), ["api", "--hostname", "github.com"]);
      const endpoint = args.at(-1); assert.ok(endpoint.startsWith("repos/ivanzhao299/jinhu-smart-park/"));
      if (endpoint.endsWith("/zip")) return zip;
      return Buffer.from(JSON.stringify(endpoint.includes("/runs/") ? run : artifact));
    }
    assert.equal(file, "unzip");
    if (args[0] === "-Z1") return Buffer.from(listing + "\n");
    assert.equal(args.at(-1), CENSUS_FILE); envelope.censusSha256 = hash(canonical(census)); return Buffer.from(JSON.stringify(envelope, null, 2));
  };
  const collect = () => materializeAssignedScopeCensusBaseline(f.put("census-config.json", config).path, { now: NOW, currentHead: () => f.triple.codeSha, command });
  return { f, config, census, envelope, run, artifact, calls, collect, command, setListing: x => { listing = x; } };
}

test("default currentHead path reaches the real canonical repository gate", async t => {
  const s = setup(t), calls = [], expectedRoot = resolve(import.meta.dirname, "../..");
  const mock = t.mock.method(childProcess, "execFileSync", (file, args, options) => {
    assert.equal(file, "git"); assert.equal(options.cwd, expectedRoot); calls.push(args);
    return args[0] === "rev-parse" ? s.f.triple.codeSha + "\n" : "";
  });
  syncBuiltinESMExports();
  try {
    const receipt = await materializeAssignedScopeCensusBaseline(s.f.put("default-root-config.json", s.config).path, { now: NOW, command: s.command });
    assert.equal(receipt.status, "BASELINE_COLLECTED"); assert.equal(calls.length, 8);
    assert.ok(calls[0].includes("scripts/hr-cutover/materialize-production-import-assigned-census-baseline.mjs"));
  } finally { mock.mock.restore(); syncBuiltinESMExports(); }
});

test("verified observer provenance -> exhaustive absence baseline with executor identity preserved", async t => {
  const s = setup(t), receipt = await s.collect(); assert.equal(receipt.absentCount, 1); assert.equal(receipt.businessWrites, 0);
  const path = join(s.config.outputDir, "touched-baseline.json"), bytes = readFileSync(path), baseline = JSON.parse(bytes);
  assert.ok(bytes.length > 0);
  assert.equal(baseline.observedAt, s.census.observedAt); assert.equal(baseline.expiresAt, s.census.expiresAt);
  assert.deepEqual(receipt.scopeCounts, { assigned: 3, valid: 3 });
  assert.equal(baseline.triple.codeSha, ASSIGNED_CENSUS_EXECUTOR_SHA);
  assert.equal(s.calls.filter(([file]) => file === "gh").length, 3);
});

for (const defect of ["collision", "missing-table", "digest", "duplicate-hash", "count", "unsorted", "scope", "identity", "triple", "stale", "extended-ttl", "invalid-assignment", "multiple-assignment", "workflow", "attempt", "artifact", "archive", "entry", "code", "records-hash", "merge", "skip", "unknown-table", "duplicate-target"]) test(`fails closed: ${defect}`, async t => {
  const s = setup(t), table = "sys_org", v = s.census.tables[table];
  const p = JSON.parse(readFileSync(s.config.phases.T0.path)), id = p.records[0].targetId;
  if (defect === "collision") { v.hashes = [censusIdHash(table, id)]; v.count = 1; v.sha256 = censusTableHash(table, v.hashes); }
  if (defect === "missing-table") delete s.census.tables[table];
  if (defect === "digest") v.sha256 = hash("wrong");
  if (defect === "duplicate-hash") { v.hashes = [hash("x"), hash("x")]; v.count = 2; v.sha256 = censusTableHash(table, v.hashes); }
  if (defect === "count") v.count = 1;
  if (defect === "unsorted") { v.hashes = ["f".repeat(64), "a".repeat(64)]; v.count = 2; v.sha256 = censusTableHash(table, v.hashes); }
  if (defect === "scope") s.census.targetScopeSha256 = hash("wrong");
  if (defect === "identity") s.census.targetIdentitySha256 = hash("wrong");
  if (defect === "triple") s.envelope.triple = { ...s.f.triple, sourceSnapshotHash: hash("wrong") };
  if (defect === "stale") s.census.expiresAt = "2026-09-09T00:59:00Z";
  if (defect === "extended-ttl") s.census.expiresAt = "2026-09-09T02:00:00Z";
  if (defect === "invalid-assignment") s.census.scopeCounts.valid = 0;
  if (defect === "multiple-assignment") s.census.selection.assigned = 2;
  if (defect === "workflow") s.run.path = ".github/workflows/untrusted.yml";
  if (defect === "attempt") s.run.run_attempt = 2;
  if (defect === "artifact") s.artifact.workflow_run.id = 999;
  if (defect === "archive") s.artifact.digest = `sha256:${hash("wrong")}`;
  if (defect === "entry") s.setListing("../id-census.json");
  if (defect === "code") s.config.provenance.observerCodeSha = "2".repeat(40);
  if (defect === "records-hash") s.config.phases.T0.sha256 = hash("wrong");
  if (["merge", "skip", "unknown-table", "duplicate-target"].includes(defect)) {
    if (defect === "merge" || defect === "skip") p.records[0].disposition = defect === "skip" ? "skip_approved" : "merge";
    if (defect === "unknown-table") p.records[0].plannedTargetTable = "sys_user";
    if (defect === "duplicate-target") p.records.push(structuredClone(p.records[0]));
    s.config.phases.T0 = s.f.put("changed-phase.json", p);
  }
  await assert.rejects(s.collect, e => /^PRODUCTION_IMPORT_CENSUS_[A-Z_]+$/u.test(e.message));
  assert.deepEqual(readdirSync(s.config.outputDir), []);
});

test("quarantine has no target read or absence entry", async t => {
  const s = setup(t), p = JSON.parse(readFileSync(s.config.phases.T0.path)); p.records[0].disposition = "quarantine";
  s.config.phases.T0 = s.f.put("quarantine-phase.json", p); assert.equal((await s.collect()).absentCount, 0);
});

