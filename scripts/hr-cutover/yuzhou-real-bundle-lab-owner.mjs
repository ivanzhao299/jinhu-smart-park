/* global structuredClone: readonly */
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { createLabImportPhaseWriters } from "./production-import-phase-writers.mjs";
import { createLabImportPhaseRollback } from "./production-import-phase-rollback.mjs";
import { computeProductionImportPayloadHash, computeProductionImportPayloadBundleHash } from "./production-import-sealed-plan-lib.mjs";

const PHASES = ["T0", "T1", "T2", "T3"];
const HASH = /^[0-9a-f]{64}$/u;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = () => { throw new Error("LAB_OWNER_GUARD"); };
const sameFields = (a, b, fields) => a && b && fields.every(key => a[key] === b[key]);
const BINDING_FIELDS = ["codeSha", "sourceSnapshotHash", "mappingSha256", "executorSha256"];
const SCOPE_FIELDS = ["tenantId", "parkId", "scopeSha256"];
const COUNT_FIELDS = ["records", "inserted", "quarantined"];
const HTTP_FIELDS = ["employees", "contracts", "attendanceCalendars", "insurancePeriods"];
function immutable(value) { if (value && typeof value === "object") { Object.values(value).forEach(immutable); Object.freeze(value); } return value; }
function safeFailureCode(error) {
  try {
    // Do not invoke accessors or copy messages, detail, SQL or driver objects.
    const code = Object.getOwnPropertyDescriptor(error, "code")?.value;
    if (typeof code !== "string") return null;
    if (/^(?:PRODUCTION_IMPORT_|LAB_IMPORT_|LAB_ROLLBACK_)[A-Z_]{1,96}$/u.test(code)) return code;
    if (/^[0-9A-Z]{5}$/u.test(code)) return `SQLSTATE_${code}`;
  } catch { /* Unknown thrown values carry no safe diagnostic. */ }
  return null;
}
function decode(bytes, expected) {
  if (!(bytes instanceof Uint8Array) || !HASH.test(expected ?? "") || hash(bytes) !== expected) fail();
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
function validate(manifest) {
  const { binding, target, phases } = manifest;
  if (!binding || !/^[0-9a-f]{40}$/u.test(binding.codeSha ?? "") ||
      [binding.sourceSnapshotHash, binding.mappingSha256, binding.executorSha256].some(value => !HASH.test(value ?? "")) ||
      !target || !/^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u.test(target.database ?? "") || target.database.length > 63 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{5,59}$/u.test(manifest.runId ?? "") ||
      !/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u.test(manifest.operationId ?? "") ||
      !HASH.test(manifest.targetScope?.scopeSha256 ?? "") ||
      [manifest.targetScope?.tenantId, manifest.targetScope?.parkId].some(value => typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value)) ||
      !Array.isArray(phases) || phases.length !== 4 || phases.some((item, index) => item.phase !== PHASES[index])) fail();
  const refs = phases.flatMap(item => [item.phaseArtifact, item.payloadArtifact]);
  if (refs.some(item => !item || typeof item.ref !== "string" || !item.ref || !HASH.test(item.sha256 ?? "")) || new Set(refs.map(item => item.ref)).size !== 8) fail();
  if (!manifest.httpCounts || Object.keys(manifest.httpCounts).length !== 4 || ["employees", "contracts", "attendanceCalendars", "insurancePeriods"].some(key => !Number.isSafeInteger(manifest.httpCounts[key]) || manifest.httpCounts[key] <= 0)) fail();
}

/** No CLI, extraction, production mode, credentials, or logging.
 * Adapters are trusted integration boundaries, not attestations. Contract mode is
 * mandatory when injecting writers/rollback; real mode uses the formal factories.
 * readArtifact returns private bytes; checkpoint must durably persist only its safe
 * hash/run metadata before COMMIT. Caller must provide process-signal cancellation
 * and a recovery entrypoint for SIGKILL/connection loss (not implemented here).
 */
export async function runYuzhouRealBundleLabOwner({ manifestBytes, manifestSha256, readArtifact, pool, cryptoProvider, adapters, mode = "contract", signal }) {
  let stage = "INPUT", client, ownerLease, locked = false, lockUncertain = false, transaction = false, commitAttempted = false, applied = false;
  let manifest, prepared, baseline, http = false, reversed = false, residual = false;
  const failures = [], counts = { records: 0, inserted: 0, quarantined: 0 };
  const note = code => { if (!failures.includes(code)) failures.push(code); };
  const cancelled = () => { if (signal?.aborted) fail(); };
  const rollbackTransaction = async () => {
    if (!transaction) return true;
    try { await client.query("ROLLBACK"); transaction = false; return true; }
    catch { note("LAB_OWNER_TRANSACTION_ROLLBACK_FAILED"); return false; }
  };
  try {
    if (!["contract", "real"].includes(mode) || typeof readArtifact !== "function" ||
        !["verifyBinding", "acquireExclusiveOwner", "captureBaseline", "checkpoint", "verifyHttp", "resolveApplyState", "verifyResidual"].every(key => typeof adapters?.[key] === "function") ||
        !["127.0.0.1", "::1"].includes(pool?.options?.host) || (mode === "real" && (adapters.createWriters || adapters.createRollback))) fail();
    manifest = immutable(decode(manifestBytes, manifestSha256)); validate(manifest);
    if (pool.options.database !== manifest.target.database) fail();
    stage = "ARTIFACTS";
    prepared = [];
    // Read and hash EVERY immutable artifact before acquiring a writable connection.
    for (const descriptor of manifest.phases) {
      cancelled();
      const phase = decode(await readArtifact(descriptor.phaseArtifact.ref), descriptor.phaseArtifact.sha256);
      const payloadBundle = decode(await readArtifact(descriptor.payloadArtifact.ref), descriptor.payloadArtifact.sha256);
      if (phase.phase !== descriptor.phase || payloadBundle.phase !== descriptor.phase || !Array.isArray(phase.records) ||
          !Array.isArray(payloadBundle.records) || phase.records.length !== payloadBundle.records.length ||
          phase.ordinal !== PHASES.indexOf(descriptor.phase) || !HASH.test(phase.sourceBatchManifestSha256 ?? "") ||
          phase.sourceBatchManifestSha256 !== payloadBundle.sourceBatchManifestSha256 ||
          (phase.payloadBundleArtifactSha256 !== undefined && phase.payloadBundleArtifactSha256 !== computeProductionImportPayloadHash(payloadBundle)) ||
          (phase.payloadBundleSha256 !== undefined && phase.payloadBundleSha256 !== computeProductionImportPayloadBundleHash(payloadBundle)) ||
          (payloadBundle.targetScope && !sameFields(payloadBundle.targetScope, manifest.targetScope, SCOPE_FIELDS)) ||
          phase.records.some(row => !["insert", "quarantine"].includes(row.disposition))) fail();
      counts.records += phase.records.length;
      counts.inserted += phase.records.filter(row => row.disposition === "insert").length;
      counts.quarantined += phase.records.filter(row => row.disposition === "quarantine").length;
      // Existing producer records artifacts omit bundle hashes. Pin their bytes
      // above, then attach canonical bundle identities only in private memory.
      prepared.push(immutable({ phase: { ...phase, payloadBundleArtifactSha256: computeProductionImportPayloadHash(payloadBundle),
        payloadBundleSha256: computeProductionImportPayloadBundleHash(payloadBundle), canonicalizationVersion: payloadBundle.canonicalizationVersion }, payloadBundle }));
    }
    if (!counts.records || !sameFields(counts, manifest.expectedCounts, COUNT_FIELDS)) fail();
    stage = "BINDING";
    const binding = await adapters.verifyBinding(manifest);
    if (!sameFields(binding?.binding, manifest.binding, BINDING_FIELDS) || binding?.capacityReady !== true) fail();
    stage = "OWNER";
    ownerLease = await adapters.acquireExclusiveOwner({ manifestSha256, runId: manifest.runId });
    if (!ownerLease || typeof ownerLease.release !== "function") fail();
    stage = "TARGET"; client = await pool.connect();
    const identity = (await client.query("SELECT current_database() AS database_name")).rows;
    if (identity?.length !== 1 || identity[0].database_name !== manifest.target.database) fail();
    stage = "LOCK";
    // Database-wide, not run-specific: two different run IDs cannot own this lab.
    lockUncertain = true;
    const lockRows = (await client.query("SELECT pg_try_advisory_lock(8050, 702) AS locked")).rows;
    if (lockRows?.length !== 1 || typeof lockRows[0].locked !== "boolean") fail();
    locked = lockRows[0].locked;
    lockUncertain = false;
    if (!locked) fail();
    stage = "BASELINE"; cancelled();
    baseline = await adapters.captureBaseline({ tx: client, manifest });
    if (baseline?.emptyWritableSlice !== true || baseline?.activeRunCount !== 0 || baseline?.scopeOwnedAndActive !== true || baseline?.otherWriters !== 0) fail();
    const options = { cryptoProvider, expectedDatabase: manifest.target.database, codeSha: manifest.binding.codeSha,
      sourceSnapshotHash: manifest.binding.sourceSnapshotHash, runId: manifest.runId };
    const writers = (adapters.createWriters ?? createLabImportPhaseWriters)(options);
    const { cryptoProvider: unused, ...rollbackOptions } = options;
    void unused;
    const reverse = (adapters.createRollback ?? createLabImportPhaseRollback)(rollbackOptions);
    stage = "APPLY"; cancelled(); transaction = true; await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    for (const input of prepared) {
      cancelled();
      const result = await writers[input.phase.phase]({ tx: client, operationId: manifest.operationId, targetScope: manifest.targetScope,
        phase: structuredClone(input.phase), payloadBundle: structuredClone(input.payloadBundle) });
      if (!Array.isArray(result?.records) || result.records.length !== input.phase.records.length) fail();
    }
    stage = "CHECKPOINT";
    if (await adapters.checkpoint({ manifestSha256, binding: manifest.binding, runId: manifest.runId, state: "apply_commit_intent" }) !== true) fail();
    stage = "APPLY_COMMIT"; cancelled(); commitAttempted = true; await client.query("COMMIT"); transaction = false; applied = true;
    try {
      stage = "HTTP"; cancelled();
      const receipt = await adapters.verifyHttp({ manifest, counts: { ...counts }, signal });
      const verification = receipt?.verification;
      if (receipt?.status !== "PASS" || receipt.fixtureCleanup !== "PASS" || receipt.fullAppModule !== true || receipt.productionImport !== "HOLD" ||
          verification?.status !== (mode === "real" ? "PASS" : "CONTRACT_PASS") || verification.productionImport !== "HOLD" ||
          !sameFields(verification.observedCounts, manifest.httpCounts, HTTP_FIELDS) ||
          (mode === "real" && (verification.evidenceKind !== "loopback_http" || verification.httpVerified !== true || verification.authenticationVerified !== true))) fail();
      http = true;
    } catch { note("LAB_OWNER_HTTP_FAILED"); }
    stage = "REVERSE";
    transaction = true; await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    for (const input of [...prepared].reverse()) await reverse({ tx: client, phase: input.phase.phase, records: structuredClone(input.phase.records), targetScope: manifest.targetScope });
    await client.query("COMMIT"); transaction = false; applied = false; reversed = true;
  } catch (error) {
    note(`LAB_OWNER_${stage}_FAILED`);
    const diagnostic = safeFailureCode(error); if (diagnostic) note(diagnostic);
    await rollbackTransaction();
    // A lost COMMIT acknowledgement must never be interpreted as a rolled-back apply.
    if (commitAttempted && !reversed && client && prepared) {
      try {
        const state = await adapters.resolveApplyState({ tx: client, manifest });
        if (state !== "absent" && state !== "applied") fail();
        applied = state === "applied";
        if (applied && !transaction) {
          const reverse = (adapters.createRollback ?? createLabImportPhaseRollback)({ expectedDatabase: manifest.target.database,
            codeSha: manifest.binding.codeSha, sourceSnapshotHash: manifest.binding.sourceSnapshotHash, runId: manifest.runId });
          transaction = true; await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
          for (const input of [...prepared].reverse()) await reverse({ tx: client, phase: input.phase.phase, records: structuredClone(input.phase.records), targetScope: manifest.targetScope });
          await client.query("COMMIT"); transaction = false; applied = false; reversed = true;
        }
      } catch (error) { note("LAB_OWNER_RECOVERY_FAILED"); const diagnostic = safeFailureCode(error); if (diagnostic) note(diagnostic); await rollbackTransaction(); }
    }
  } finally {
    await rollbackTransaction();
    if (locked && baseline) {
      try {
        const proof = await adapters.verifyResidual({ tx: client, manifest, baseline });
        residual = proof?.baselineRestored === true && proof?.activeRunMaps === 0 && proof?.businessResidualRows === 0 && proof?.httpFixtureResidualRows === 0;
        if (!residual) note("LAB_OWNER_RESIDUAL_FAILED");
      } catch { note("LAB_OWNER_RESIDUAL_FAILED"); }
    }
    if (locked) { try { if ((await client.query("SELECT pg_advisory_unlock(8050, 702) AS unlocked")).rows?.[0]?.unlocked !== true) fail(); locked = false; } catch { note("LAB_OWNER_UNLOCK_FAILED"); } }
    if (client) { try { client.release(transaction || locked || lockUncertain ? new Error("LAB_OWNER_CONNECTION_UNSAFE") : undefined); } catch { note("LAB_OWNER_RELEASE_FAILED"); } }
    if (ownerLease) { try { if (await ownerLease.release() !== true) fail(); } catch { note("LAB_OWNER_LEASE_RELEASE_FAILED"); } }
  }
  const passed = failures.length === 0 && http && reversed && residual && !applied;
  return { status: passed ? mode === "real" ? "LAB_PASS" : "CONTRACT_PASS" : "FAILED", evidenceKind: mode === "real" ? "injected_io_formal_writers" : "synthetic_adapter_contract",
    operationalCli: false, productionImport: "HOLD", counts, httpVerified: passed && mode === "real", rollbackVerified: reversed && residual,
    residualVerified: residual, failureCodes: failures };
}
