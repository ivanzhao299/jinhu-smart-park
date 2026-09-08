#!/usr/bin/env node
/* global Buffer, process, URL */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProductionImportPostgresAdapter } from "./production-import-postgres-adapter.mjs";
import { readProductionImportBaselineRows } from "./production-import-phase-writers.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as MODEL } from "./production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";
import { currentCandidateFreezeRepositorySha, readProductionImportPrivateBytes as read,
  productionImportPrivateDirectory as directory, productionImportCanonicalPath as canonicalPath,
  sameProductionImportPrivateFile as sameFile, parseProductionImportPrivateJson as parse,
  measureProductionImportPrivateJson as measure, emitProductionImportPrivateArtifacts as emit } from "./materialize-production-import-frozen-decisions.mjs";
const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url))), MAX = 2_000_000_000, MIB = 1024 ** 2;
const busy = new WeakSet(), poisoned = new WeakSet();
const fail = code => { const e = new Error(`PRODUCTION_IMPORT_BASELINE_${code}`); e.code = e.message; throw e; };
const exact = (v, keys) => { if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join("|") !== [...keys].sort().join("|")) fail("INPUT_INVALID"); };
const digest = value => createHash("sha256").update(value).digest("hex");
const safe = e => /^PRODUCTION_IMPORT_[A-Z_]+$/u.test(e?.code ?? "") ? e.code : "PRODUCTION_IMPORT_BASELINE_QUERY_FAILED";

async function collectConnectedBaseline({ client, binding, triple, phases, expiresAt, now = new Date(), batchSize = 1000, statementTimeoutMs = 30000 }) {
  if (!client || typeof client.query !== "function" || busy.has(client) || poisoned.has(client)) fail("CLIENT_INVALID");
  exact(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (!/^[a-f0-9]{40}$/u.test(triple.codeSha) || ![triple.sourceSnapshotHash, triple.mappingContractHash].every(v => /^[a-f0-9]{64}$/u.test(v)) ||
    !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 2000 || !Number.isSafeInteger(statementTimeoutMs) || statementTimeoutMs < 1 || statementTimeoutMs > 300000) fail("INPUT_INVALID");
  const observedAt = new Date(now).toISOString();
  if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(observedAt) || Date.parse(expiresAt) - Date.parse(observedAt) > 3600000) fail("WINDOW_INVALID");
  if (binding?.targetScope?.scopeSha256 !== computeProductionImportTargetScopeHash(binding?.targetScope ?? {})) fail("SCOPE_INVALID");
  exact(phases, MODEL.phaseOrder);
  const seen = new Set();
  for (const [ordinal, phase] of MODEL.phaseOrder.entries()) {
    const p = phases[phase];
    if (p?.phase !== phase || p.ordinal !== ordinal || !Array.isArray(p.records) || !/^[a-f0-9]{64}$/u.test(p.sourceBatchManifestSha256 ?? "")) fail("PHASE_INVALID");
    for (const r of p.records) {
      if (!Object.hasOwn(MODEL.targetTables, r.plannedTargetTable) || MODEL.targetTables[r.plannedTargetTable].phase !== phase || !["insert", "merge", "skip_approved", "quarantine"].includes(r.disposition)) fail("RECORD_INVALID");
      if (r.disposition === "quarantine") continue;
      const key = `${r.targetTable}:${r.targetId}`;
      if (r.targetTable !== r.plannedTargetTable || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(r.targetId ?? "") || seen.has(key)) fail("RECORD_INVALID");
      seen.add(key);
      if (r.disposition !== "insert" && (!Number.isSafeInteger(r.expectedTargetVersionBefore) || r.expectedTargetVersionBefore < 1 || !/^[a-f0-9]{64}$/u.test(r.expectedTargetBeforeSha256 ?? "") ||
        (r.disposition === "skip_approved" && r.expectedTargetAfterSha256 !== r.expectedTargetBeforeSha256))) fail("RECORD_INVALID");
    }
  }
  const adapter = createProductionImportPostgresAdapter({ client, binding, ownership: "borrowed" });
  busy.add(client); let result, primary, originalFailure;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SELECT set_config('statement_timeout',$1,true),set_config('idle_in_transaction_session_timeout',$1,true),set_config('TimeZone','Asia/Shanghai',true),set_config('application_name','jinhu_hr_prod_import:baseline_readonly',true)", [String(statementTimeoutMs)]);
    const observed = await adapter.probeTarget({ targetIdentitySha256: binding.targetIdentitySha256, targetScope: binding.targetScope });
    // Exact existing snapshot algorithm; current_user intentionally participates.
    const material = [observed.database, observed.databaseUser, observed.serverIdentity.address, String(observed.serverIdentity.port), observed.serverIdentity.databaseOid, observed.targetScope.tenantId, observed.targetScope.parkId].join("\x1f");
    if (digest(`yuzhou-hr-production-target-v1:${material}`) !== binding.targetIdentitySha256) fail("IDENTITY_MISMATCH");
    const collected = {};
    for (const phase of MODEL.phaseOrder) {
      const value = { rows: [], absent: [] }; collected[phase] = value;
      const records = phases[phase].records.filter(r => r.disposition !== "quarantine");
      for (const table of [...new Set(records.map(r => r.targetTable))].sort()) {
        const inserts = records.filter(r => r.targetTable === table && r.disposition === "insert");
        const existing = records.filter(r => r.targetTable === table && r.disposition !== "insert");
        for (let start = 0; start < inserts.length; start += batchSize) {
          const part = inserts.slice(start, start + batchSize);
          const found = await client.query(`/* hr-prod-baseline:absence */ SELECT id::text FROM ${table} WHERE id=ANY($1::uuid[])`, [part.map(r => r.targetId)]);
          if (!Array.isArray(found?.rows) || found.rows.length) fail("INSERT_TARGET_EXISTS");
          for (const r of part) value.absent.push({ targetTable: table, targetId: r.targetId });
        }
        for (let start = 0; start < existing.length; start += batchSize) {
          const rows = await readProductionImportBaselineRows({ tx: client, table, records: existing.slice(start, start + batchSize), targetScope: binding.targetScope });
          for (const row of rows) value.rows.push(row);
        }
      }
    }
    result = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_touched_baseline", triple, targetIdentitySha256: binding.targetIdentitySha256, targetScope: binding.targetScope,
      observedAt, expiresAt, phases: collected, productionImport: "HOLD" };
  } catch (e) { primary = safe(e); }
  finally {
    try { await client.query("ROLLBACK"); }
    catch { originalFailure = primary; primary = "PRODUCTION_IMPORT_BASELINE_ROLLBACK_FAILED"; poisoned.add(client); }
    busy.delete(client); await adapter.close();
  }
  if (primary) { const e = new Error(primary); e.code = primary; if (originalFailure) e.primaryCode = originalFailure; throw e; }
  return result;
}

/** Own a newly constructed connection. Borrowed/already-active clients are not
 * an API: pg connect() must succeed before the internal transaction starts. */
export async function collectProductionImportBaseline({ connection, ...input }, { createClient } = {}) {
  if (Object.hasOwn(input, "client")) fail("CLIENT_INVALID");
  exact(connection, ["host", "port", "database", "user", "password"]);
  if (typeof connection.host !== "string" || !connection.host || !Number.isSafeInteger(connection.port) || connection.port < 1 || connection.port > 65535 ||
    typeof connection.password !== "string" || !connection.password || connection.database !== input.binding?.database || connection.user !== input.binding?.databaseUser) fail("CONNECTION_INVALID");
  let client, result, primary;
  try {
    if (!createClient) { const { Client } = createRequire(join(ROOT, "apps/api/package.json"))("pg"); createClient = options => new Client(options); }
    client = createClient({ ...connection, connectionTimeoutMillis: 10000, statement_timeout: 30000, options: "-c default_transaction_read_only=on" });
    if (!client || typeof client.connect !== "function" || typeof client.end !== "function") fail("CLIENT_INVALID");
    await client.connect();
    result = await collectConnectedBaseline({ ...input, client });
  } catch (e) { primary = new Error(safe(e)); primary.code = primary.message; if (/^PRODUCTION_IMPORT_[A-Z_]+$/u.test(e?.primaryCode ?? "")) primary.primaryCode = e.primaryCode; }
  finally {
    if (client && typeof client.end === "function") {
      try { await client.end(); }
      catch { const e = new Error("PRODUCTION_IMPORT_BASELINE_CLOSE_FAILED"); e.code = e.message; if (primary) e.primaryCode = primary.code; primary = e; }
    }
  }
  if (primary) throw primary;
  return result;
}

/** CLI owns one pg client and private receipt-last emission; no executor calls. */
export async function materializeProductionImportBaseline(configPath, { currentHead = () => currentCandidateFreezeRepositorySha(ROOT, ["scripts/hr-cutover/collect-production-import-baseline.mjs", "scripts/hr-cutover/production-import-phase-writers.mjs", "scripts/hr-cutover/production-import-phase-state.mjs", "scripts/hr-cutover/production-t1-local-timestamp.mjs", "scripts/hr-cutover/production-import-postgres-adapter.mjs"]), now = new Date(), createClient } = {}) {
  try {
    const budget = { bytes: 0, maximum: MAX }, snapshots = [];
    const load = (path, limit) => { const parts = [], found = read(path, limit, budget, p => parts.push(Buffer.from(p))); snapshots.push({ path, stat: found.stat });
      const bytes = Buffer.concat(parts); parts.forEach(p => p.fill(0)); try { return { value: parse(bytes), sha256: found.sha256 }; } finally { bytes.fill(0); } };
    const configFile = load(configPath, MIB), c = configFile.value;
    exact(c, ["formatVersion", "triple", "binding", "connection", "phases", "expiresAt", "outputDir"]);
    if (c.formatVersion !== 1 || c.triple?.codeSha !== currentHead()) fail("CODE_MISMATCH");
    exact(c.connection, ["host", "port", "database", "user", "password"]);
    if (typeof c.connection.host !== "string" || !c.connection.host || !Number.isSafeInteger(c.connection.port) || c.connection.port < 1 || c.connection.port > 65535 || typeof c.connection.password !== "string" || !c.connection.password ||
      c.connection.database !== c.binding?.database || c.connection.user !== c.binding?.databaseUser) fail("CONNECTION_INVALID");
    const outStat = directory(c.outputDir); if (readdirSync(c.outputDir).length) fail("OUTPUT_NOT_EMPTY");
    exact(c.phases, MODEL.phaseOrder); const phases = {}, phaseHashes = {};
    for (const phase of MODEL.phaseOrder) { exact(c.phases[phase], ["path", "sha256"]); const input = load(c.phases[phase].path, 384 * MIB); if (input.sha256 !== c.phases[phase].sha256) fail("INPUT_HASH_MISMATCH"); phases[phase] = input.value; phaseHashes[phase] = input.sha256; }
    const baseline = await collectProductionImportBaseline({ connection: c.connection, binding: c.binding, triple: c.triple, phases, expiresAt: c.expiresAt, now }, { createClient });
    if (c.triple.codeSha !== currentHead()) fail("CODE_MISMATCH");
    for (const s of snapshots) { canonicalPath(s.path); if (!sameFile(s.stat, lstatSync(s.path))) fail("INPUT_CHANGED"); }
    directory(c.outputDir, outStat);
    const artifacts = { "touched-baseline.json": baseline }, descriptors = { "touched-baseline.json": measure(baseline, 384 * MIB) };
    const receipt = { formatVersion: 1, status: "BASELINE_COLLECTED", configArtifactSha256: configFile.sha256, triple: c.triple, phaseArtifactSha256: phaseHashes, artifacts: descriptors,
      businessWrites: 0, snapshotOnly: true, productionImport: "HOLD" };
    emit(c.outputDir, artifacts, receipt, descriptors, 384 * MIB, "baseline-collection-receipt.json"); return receipt;
  } catch (e) { const error = new Error(safe(e)); error.code = error.message; if (/^PRODUCTION_IMPORT_[A-Z_]+$/u.test(e?.primaryCode ?? "")) error.primaryCode = e.primaryCode; throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (process.argv.length !== 4 || process.argv[2] !== "--config") fail("CONFIG_REQUIRED"); process.stdout.write(JSON.stringify(await materializeProductionImportBaseline(process.argv[3])) + "\n"); }
  catch (e) { process.stderr.write(`${safe(e)}\n`); process.exitCode = 1; }
}
