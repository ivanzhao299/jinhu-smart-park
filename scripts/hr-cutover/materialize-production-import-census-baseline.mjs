#!/usr/bin/env node
/* global Buffer, process, URL */
import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CENSUS_ARTIFACT, CENSUS_FILE, CENSUS_MAX_BYTES, CENSUS_TABLES, censusHash as hash, censusFail as fail, censusExact as exact, censusIdHash, validateIdCensus } from "./production-import-id-census.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as MODEL, stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";
import { currentCandidateFreezeRepositorySha, readProductionImportPrivateBytes as read, productionImportPrivateDirectory as directory,
  productionImportCanonicalPath as canonicalPath, sameProductionImportPrivateFile as sameFile, parseProductionImportPrivateJson as parse,
  measureProductionImportPrivateJson as measure, emitProductionImportPrivateArtifacts as emit } from "./materialize-production-import-frozen-decisions.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url))), MIB = 1024 ** 2;
const REPO = "ivanzhao299/jinhu-smart-park", WORKFLOW = ".github/workflows/deploy-production.yml";
const dependencies = ["scripts/hr-cutover/materialize-production-import-census-baseline.mjs", "scripts/hr-cutover/production-import-id-census.mjs", WORKFLOW];
const same = (a, b) => canonical(a) === canonical(b);
const runCommand = (file, args, maximum) => execFileSync(file, args, { maxBuffer: maximum, timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });

/** Live GitHub API is the trust boundary, not caller-supplied success metadata.
 * command is a synthetic-test seam; the CLI cannot configure it or the host/repo. */
export function downloadProductionIdCensus(provenance, { command = runCommand } = {}) {
  exact(provenance, ["runId", "runAttempt", "artifactId", "codeSha"]);
  for (const k of ["runId", "runAttempt", "artifactId"]) if (!/^[1-9][0-9]{0,19}$/u.test(provenance[k] ?? "")) fail("PROVENANCE_INVALID");
  if (!/^[a-f0-9]{40}$/u.test(provenance.codeSha ?? "")) fail("PROVENANCE_INVALID");
  const api = (path, max = MIB) => command("gh", ["api", "--hostname", "github.com", `repos/${REPO}/${path}`], max);
  let dir, zip;
  try {
    const run = parse(api(`actions/runs/${provenance.runId}`));
    if (String(run.id) !== provenance.runId || String(run.run_attempt) !== provenance.runAttempt || run.head_sha !== provenance.codeSha || run.head_branch !== "main" ||
      run.event !== "workflow_dispatch" || run.status !== "completed" || run.conclusion !== "success" || run.path !== WORKFLOW || run.repository?.full_name !== REPO) fail("WORKFLOW_UNTRUSTED");
    const artifact = parse(api(`actions/artifacts/${provenance.artifactId}`));
    if (String(artifact.id) !== provenance.artifactId || artifact.name !== CENSUS_ARTIFACT || artifact.expired !== false || String(artifact.workflow_run?.id) !== provenance.runId ||
      artifact.workflow_run?.head_sha !== provenance.codeSha || !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? "") ||
      !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 1 || artifact.size_in_bytes > CENSUS_MAX_BYTES ||
      !Number.isFinite(Date.parse(artifact.created_at)) || !Number.isFinite(Date.parse(run.run_started_at)) || Date.parse(artifact.created_at) < Date.parse(run.run_started_at)) fail("ARTIFACT_UNTRUSTED");
    const bytes = api(`actions/artifacts/${provenance.artifactId}/zip`, CENSUS_MAX_BYTES);
    if (hash(bytes) !== artifact.digest.slice(7)) fail("ARCHIVE_DIGEST_MISMATCH");
    dir = mkdtempSync(join(tmpdir(), "yuzhou-id-census-")); zip = join(dir, "census.zip"); writeFileSync(zip, bytes, { flag: "wx", mode: 0o600 });
    const listing = command("unzip", ["-Z1", zip], MIB).toString("utf8").trim();
    if (listing !== CENSUS_FILE) fail("ARCHIVE_CONTENT_INVALID");
    const contents = command("unzip", ["-p", zip, CENSUS_FILE], CENSUS_MAX_BYTES);
    const envelope = parse(contents);
    exact(envelope, ["formatVersion", "kind", "triple", "workflow", "census", "censusSha256", "productionImport"]);
    const expectedWorkflow = { repository: REPO, runId: provenance.runId, runAttempt: provenance.runAttempt, codeSha: provenance.codeSha };
    if (envelope.formatVersion !== 1 || envelope.kind !== "yuzhou_workflow_id_census_v1" || envelope.productionImport !== "HOLD" ||
      !same(envelope.workflow, expectedWorkflow) || envelope.censusSha256 !== hash(canonical(envelope.census)) ||
      Date.parse(envelope.census.observedAt) < Date.parse(run.run_started_at) || Date.parse(envelope.census.observedAt) > Date.parse(artifact.created_at)) fail("ENVELOPE_INVALID");
    return { envelope, artifactSha256: hash(contents), archiveSha256: artifact.digest.slice(7), provenance };
  } catch (e) { fail(/^PRODUCTION_IMPORT_CENSUS_[A-Z_]+$/u.test(e?.code ?? "") ? e.code.slice("PRODUCTION_IMPORT_CENSUS_".length) : "DOWNLOAD_FAILED"); }
  finally { try { if (zip) unlinkSync(zip); if (dir) rmdirSync(dir); } catch { fail("SCRATCH_CLEANUP_FAILED"); } }
}

export async function materializeProductionImportCensusBaseline(configPath, { now = new Date(), currentHead = () => currentCandidateFreezeRepositorySha(ROOT, dependencies), command } = {}) {
  const startedAt = Date.now(), evidenceNow = () => new Date(new Date(now).getTime() + Date.now() - startedAt);
  try {
    const budget = { bytes: 0, maximum: 2_000_000_000 }, snapshots = [];
    const load = (path, limit) => {
      const parts = [], result = read(path, limit, budget, p => parts.push(Buffer.from(p))); snapshots.push({ path, stat: result.stat });
      const bytes = Buffer.concat(parts); parts.forEach(p => p.fill(0));
      try { return { value: parse(bytes), sha256: result.sha256 }; } finally { bytes.fill(0); }
    };
    const cf = load(configPath, MIB), c = cf.value;
    exact(c, ["formatVersion", "triple", "targetIdentitySha256", "targetScope", "provenance", "phases", "outputDir"]);
    exact(c.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
    exact(c.targetScope, ["tenantId", "parkId", "scopeSha256"]);
    if (c.formatVersion !== 1 || c.triple.codeSha !== currentHead() || c.provenance?.codeSha !== c.triple.codeSha ||
      ![c.triple.sourceSnapshotHash, c.triple.mappingContractHash, c.targetIdentitySha256].every(h => /^[a-f0-9]{64}$/u.test(h))) fail("BINDING_INVALID");
    if (c.targetScope.scopeSha256 !== computeProductionImportTargetScopeHash(c.targetScope)) fail("SCOPE_INVALID");
    const outStat = directory(c.outputDir); if (readdirSync(c.outputDir).length) fail("OUTPUT_NOT_EMPTY");
    const remote = downloadProductionIdCensus(c.provenance, { command });
    const census = validateIdCensus(remote.envelope.census, evidenceNow());
    if (!same(remote.envelope.triple, c.triple) || census.targetIdentitySha256 !== c.targetIdentitySha256 || census.targetScopeSha256 !== c.targetScope.scopeSha256) fail("BINDING_MISMATCH");
    exact(c.phases, MODEL.phaseOrder);
    const sets = Object.fromEntries(CENSUS_TABLES.map(t => [t, new Set(census.tables[t].hashes)])), seen = new Set(), phases = {}, phaseHashes = {};
    for (const [ordinal, name] of MODEL.phaseOrder.entries()) {
      exact(c.phases[name], ["path", "sha256"]);
      const artifact = load(c.phases[name].path, 384 * MIB), p = artifact.value;
      if (artifact.sha256 !== c.phases[name].sha256) fail("INPUT_HASH_MISMATCH");
      if (p.phase !== name || p.ordinal !== ordinal || !/^[a-f0-9]{64}$/u.test(p.sourceBatchManifestSha256 ?? "") || !Array.isArray(p.records)) fail("PHASE_INVALID");
      phaseHashes[name] = artifact.sha256; const absent = [];
      for (const r of p.records) {
        if (!["insert", "quarantine"].includes(r.disposition)) fail("DISPOSITION_UNSUPPORTED");
        if (!Object.hasOwn(MODEL.targetTables, r.plannedTargetTable) || MODEL.targetTables[r.plannedTargetTable].phase !== name) fail("RECORD_INVALID");
        if (r.disposition === "quarantine") continue;
        if (r.targetTable !== r.plannedTargetTable) fail("RECORD_INVALID");
        const h = censusIdHash(r.targetTable, r.targetId), key = `${r.targetTable}:${r.targetId}`;
        if (seen.has(key)) fail("DUPLICATE_TARGET"); seen.add(key);
        if (sets[r.targetTable].has(h)) fail("INSERT_TARGET_EXISTS");
        absent.push({ targetTable: r.targetTable, targetId: r.targetId });
      }
      phases[name] = { rows: [], absent };
    }
    if (currentHead() !== c.triple.codeSha) fail("CODE_MISMATCH");
    for (const s of snapshots) { canonicalPath(s.path); if (!sameFile(s.stat, lstatSync(s.path))) fail("INPUT_CHANGED"); }
    directory(c.outputDir, outStat);
    validateIdCensus(census, evidenceNow());
    const baseline = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_touched_baseline", triple: c.triple, targetIdentitySha256: c.targetIdentitySha256,
      targetScope: c.targetScope, observedAt: census.observedAt, expiresAt: census.expiresAt, phases, productionImport: "HOLD" };
    const artifacts = { "touched-baseline.json": baseline }, descriptors = { "touched-baseline.json": measure(baseline, 384 * MIB) };
    const receipt = { formatVersion: 1, status: "BASELINE_COLLECTED", method: "verified_workflow_global_id_census_v1", configArtifactSha256: cf.sha256,
      triple: c.triple, provenance: c.provenance, censusArtifactSha256: remote.artifactSha256, archiveSha256: remote.archiveSha256,
      phaseArtifactSha256: phaseHashes, artifacts: descriptors, absentCount: seen.size, businessWrites: 0, snapshotOnly: true, productionImport: "HOLD" };
    emit(c.outputDir, artifacts, receipt, descriptors, 384 * MIB, "baseline-collection-receipt.json"); return receipt;
  } catch (e) { fail(/^PRODUCTION_IMPORT_CENSUS_[A-Z_]+$/u.test(e?.code ?? "") ? e.code.slice("PRODUCTION_IMPORT_CENSUS_".length) : "MATERIALIZATION_FAILED"); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (process.argv.length !== 4 || process.argv[2] !== "--config") fail("USAGE"); process.stdout.write(JSON.stringify(await materializeProductionImportCensusBaseline(process.argv[3])) + "\n"); }
  catch (e) { process.stderr.write(`${e.code ?? "PRODUCTION_IMPORT_CENSUS_FAILED"}\n`); process.exitCode = 1; }
}
