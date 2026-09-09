/* global Buffer, process, structuredClone */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { fixture } from "./production-import-plan-test-fixture.mjs";
import { CENSUS_TABLES, CENSUS_FILE, CENSUS_ARTIFACT, censusHash as hash, censusIdHash, censusTableHash, validateIdCensus, productionIdCensusSql, productionIdCensusShell } from "../hr-cutover/production-import-id-census.mjs";
import { stableProductionImportCanonicalJson as canonical } from "../hr-cutover/production-import-target-model.mjs";
import { materializeProductionImportCensusBaseline } from "../hr-cutover/materialize-production-import-census-baseline.mjs";
const NOW = new Date("2026-09-09T01:00:00Z");

function setup(t) {
  const f = fixture(t), census = { formatVersion: 1, kind: "yuzhou_global_id_census_v1", targetIdentitySha256: f.baseline.targetIdentitySha256,
    targetScopeSha256: f.baseline.targetScope.scopeSha256, observedAt: "2026-09-09T00:30:00Z", expiresAt: "2026-09-09T01:30:00Z", scopeCounts: { assigned: 1, valid: 1 },
    tables: Object.fromEntries(CENSUS_TABLES.map(table => [table, { count: 0, hashes: [], sha256: censusTableHash(table, []) }])), complete: true, productionImport: "HOLD" };
  const provenance = { runId: "123", runAttempt: "1", artifactId: "456", codeSha: f.triple.codeSha }, outputDir = join(f.root, "census-baseline"); mkdirSync(outputDir, { mode: 0o700 });
  const config = { formatVersion: 1, triple: f.triple, targetIdentitySha256: f.baseline.targetIdentitySha256, targetScope: f.baseline.targetScope, provenance,
    phases: Object.fromEntries(Object.entries(f.config.artifacts.phases).map(([p, v]) => [p, v.records])), outputDir };
  const workflow = { repository: "ivanzhao299/jinhu-smart-park", runId: "123", runAttempt: "1", codeSha: f.triple.codeSha };
  const envelope = { formatVersion: 1, kind: "yuzhou_workflow_id_census_v1", triple: f.triple, workflow, census, censusSha256: "", productionImport: "HOLD" };
  const run = { id: 123, run_attempt: 1, head_sha: f.triple.codeSha, head_branch: "main", event: "workflow_dispatch", status: "completed", conclusion: "success", path: ".github/workflows/deploy-production.yml", repository: { full_name: workflow.repository }, run_started_at: "2026-09-09T00:29:00Z" };
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
  const collect = () => materializeProductionImportCensusBaseline(f.put("census-config.json", config).path, { now: NOW, currentHead: () => f.triple.codeSha, command });
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
    const receipt = await materializeProductionImportCensusBaseline(s.f.put("default-root-config.json", s.config).path, { now: NOW, command: s.command });
    assert.equal(receipt.status, "BASELINE_COLLECTED"); assert.equal(calls.length, 8);
    assert.ok(calls[0].includes("scripts/hr-cutover/materialize-production-import-census-baseline.mjs"));
  } finally { mock.mock.restore(); syncBuiltinESMExports(); }
});

test("verified transport -> exhaustive absence baseline -> existing actual draft producer", async t => {
  const s = setup(t), receipt = await s.collect(); assert.equal(receipt.absentCount, 1); assert.equal(receipt.businessWrites, 0);
  const path = join(s.config.outputDir, "touched-baseline.json"), bytes = readFileSync(path), baseline = JSON.parse(bytes);
  assert.equal(baseline.observedAt, s.census.observedAt); assert.equal(baseline.expiresAt, s.census.expiresAt);
  s.f.config.artifacts.baseline = { path, sha256: hash(bytes) };
  assert.equal(s.f.run().status, "DRAFT_MATERIALIZED");
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
  if (defect === "multiple-assignment") s.census.scopeCounts.assigned = 2;
  if (defect === "workflow") s.run.path = ".github/workflows/untrusted.yml";
  if (defect === "attempt") s.run.run_attempt = 2;
  if (defect === "artifact") s.artifact.workflow_run.id = 999;
  if (defect === "archive") s.artifact.digest = `sha256:${hash("wrong")}`;
  if (defect === "entry") s.setListing("../id-census.json");
  if (defect === "code") s.config.provenance.codeSha = "2".repeat(40);
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

test("fixed SQL proves global UUID completeness and rejects RLS for business and identity tables", () => {
  const sql = productionIdCensusSql(); assert.match(sql, /^BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;/u); assert.match(sql, /ROLLBACK;\n$/u);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|COMMIT|SET ROLE)\b/u);
  assert.match(sql, /r\.relrowsecurity OR r\.relforcerowsecurity/u); assert.match(sql, /pg_inherits/u); assert.match(sql, /indisprimary AND indisvalid/u);
  assert.ok(sql.indexOf("IN ACCESS SHARE MODE;") < sql.indexOf("DO $$"), "hold schema read locks before RLS/schema inspection");
  assert.match(sql, /ARRAY\['rel_tenant_module','sys_module','sys_tenant','biz_park'\]/u);
  for (const table of CENSUS_TABLES) assert.ok(sql.includes(`FROM public.${table}) ids`), `${table} has no scoped/deletion predicate`);
  assert.match(sql, /FROM assignments a/u); assert.match(sql, /count\(\*\) FROM scopes WHERE valid/u);
  assert.ok(sql.includes("string_agg(h,E'\\n' ORDER BY h COLLATE \"C\")"));
  const id = "00000000-0000-4000-8000-000000000001";
  assert.equal(censusIdHash("sys_org", id), hash("yuzhou-global-id-v1\x1fpublic.sys_org\x1f" + id));
});

test("generated shell executes fake docker JSON exactly; failure never leaks stderr", t => {
  const f = fixture(t), bin = join(f.root, "bin"); mkdirSync(bin, { mode: 0o700 });
  const docker = join(bin, "docker"), shell = join(f.root, "probe.sh"); writeFileSync(shell, productionIdCensusShell(), { mode: 0o600 });
  writeFileSync(docker, "#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' '{\"synthetic\":true}'\n", { mode: 0o700 }); chmodSync(docker, 0o700);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const out = execFileSync("sh", [shell, f.root], { env, encoding: "utf8" }); assert.deepEqual(JSON.parse(out), { synthetic: true });
  writeFileSync(docker, "#!/bin/sh\necho SECRET_DIAGNOSTIC >&2\nexit 1\n", { mode: 0o700 });
  assert.throws(() => execFileSync("sh", [shell, f.root], { env, stdio: ["ignore", "pipe", "pipe"] }), e => e.stdout.length === 0 && e.stderr.toString().trim() === "PRODUCTION_IMPORT_CENSUS_QUERY_FAILED");
});

test("workflow route stays diagnostic and execution dependency pins include both implementations", () => {
  const root = resolve(import.meta.dirname, "../.."), workflow = readFileSync(join(root, ".github/workflows/deploy-production.yml"), "utf8");
  assert.match(workflow, /diagnose-yuzhou-hr-production-id-census\|prepare-/u);
  assert.match(workflow, /production-import-id-census\.mjs --shell/u); assert.match(workflow, /production-import-id-census\.mjs --bind/u);
  const conditions = workflow.split("\n").filter(l => l.includes("inputs.deploy_mode != 'diagnose-yuzhou-hr-production-target-inventory'"));
  assert.ok(conditions.length > 5); assert.ok(conditions.every(l => l.includes("inputs.deploy_mode != 'diagnose-yuzhou-hr-production-id-census'")));
  const entry = readFileSync(join(root, "scripts/hr-cutover/execute-production-import.mjs"), "utf8");
  assert.ok(entry.includes('"scripts/hr-cutover/production-import-id-census.mjs"')); assert.ok(entry.includes('"scripts/hr-cutover/materialize-production-import-census-baseline.mjs"'));
});

test("census validator rejects incomplete and future output", t => { const s = setup(t); s.census.complete = false; assert.throws(() => validateIdCensus(s.census, NOW)); });
