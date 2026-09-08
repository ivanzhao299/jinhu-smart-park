import { open, lstat, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { computeProductionImportPayloadBundleHash } from "./production-import-sealed-plan-lib.mjs";
const phases = ["T0", "T1", "T2", "T3"], sha = value => createHash("sha256").update(value).digest("hex");
const hashPattern = /^[0-9a-f]{64}$/u;
const eq = (a, b, keys) => a && b && keys.every(key => a[key] === b[key]);
const deny = () => { throw new Error("LAB_ARTIFACTS_INVALID"); };
async function privateRead(root, name, limit) {
  let handle;
  try {
    const directory = await lstat(root);
    if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) || await realpath(root) !== root) deny();
    const path = join(root, name), before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o077) || before.size > limit || before.size < 2) deny();
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (stat.ino !== before.ino || stat.dev !== before.dev || stat.size !== before.size) deny();
    const parts = []; let size = 0;
    for (;;) { const chunk = Buffer.alloc(Math.min(1024 * 1024, limit + 1 - size)); const { bytesRead } = await handle.read(chunk); if (!bytesRead) break; size += bytesRead; if (size > limit) deny(); parts.push(chunk.subarray(0, bytesRead)); }
    const after = await handle.stat(), current = await lstat(path), currentRoot = await lstat(root);
    if (size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || current.ino !== stat.ino || current.dev !== stat.dev || current.isSymbolicLink() || currentRoot.ino !== directory.ino || currentRoot.dev !== directory.dev) deny();
    return Buffer.concat(parts, size);
  } finally { await handle?.close(); }
}
/** Private, read-only file adapter. No filesystem paths or data are returned in evidence.
 * Caller's expected summary hash/triple and execution binding are independent trust inputs.
 * File bytes are not retained: readArtifact reopens the fixed file and rechecks its pin.
 */
export async function prepareYuzhouRealBundleLabArtifacts({ preparedRoot, expectedSummarySha256, expectedTriple, binding, target, targetScope, runId, operationId, expectedCounts, httpCounts, maxFileBytes = 256 * 1024 * 1024 }) {
  try {
    if (!isAbsolute(preparedRoot) || resolve(preparedRoot) !== preparedRoot || !hashPattern.test(expectedSummarySha256 ?? "") || !Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1024 || maxFileBytes > 512 * 1024 * 1024 ||
        !eq(binding, { codeSha: expectedTriple?.codeSha, sourceSnapshotHash: expectedTriple?.sourceSnapshotHash, mappingSha256: expectedTriple?.mappingContractHash }, ["codeSha", "sourceSnapshotHash", "mappingSha256"]) || !hashPattern.test(binding?.executorSha256 ?? "")) deny();
    if (!/^[0-9a-f]{40}$/u.test(binding.codeSha ?? "") || !hashPattern.test(binding.sourceSnapshotHash ?? "") || !hashPattern.test(binding.mappingSha256 ?? "") ||
        !/^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u.test(target?.database ?? "") || target.database.length > 63 ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{5,59}$/u.test(runId ?? "") || !/^yzprod-import-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/u.test(operationId ?? "") ||
        !hashPattern.test(targetScope?.scopeSha256 ?? "") || [targetScope?.tenantId, targetScope?.parkId].some(value => typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value)) ||
        ["records", "inserted", "quarantined"].some(key => !Number.isSafeInteger(expectedCounts?.[key]) || expectedCounts[key] < 0) ||
        ["employees", "contracts", "attendanceCalendars", "insurancePeriods"].some(key => !Number.isSafeInteger(httpCounts?.[key]) || httpCounts[key] <= 0)) deny();
    const summaryBytes = await privateRead(preparedRoot, "summary.json", 1024 * 1024);
    if (sha(summaryBytes) !== expectedSummarySha256) deny();
    const summary = JSON.parse(summaryBytes.toString("utf8"));
    if (summary.status !== "WRITER_INPUTS_PREPARED" || summary.databaseWrites !== 0 || summary.productionImport !== "HOLD" || !eq(summary.triple, expectedTriple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]) || !Array.isArray(summary.phases) || summary.phases.length !== 4) deny();
    const descriptors = [], pins = new Map(), counts = { records: 0, inserted: 0, quarantined: 0 };
    for (const [index, phase] of phases.entries()) {
      const entry = summary.phases[index];
      if (!entry || entry.phase !== phase || !hashPattern.test(entry.payloadBundleSha256 ?? "")) deny();
      const shape = Object.keys(entry).sort().join(",");
      const measured = shape === "payloadBundleSha256,payloadBytes,phase,records";
      if (!measured && shape !== "payloadBundleSha256,phase") deny();
      if (measured && (!Number.isSafeInteger(entry.records) || entry.records < 0 || !Number.isSafeInteger(entry.payloadBytes) || entry.payloadBytes < 2)) deny();
      const payloadName = `${phase.toLowerCase()}-payload.json`, recordsName = `${phase.toLowerCase()}-records.json`;
      const payloadBytes = await privateRead(preparedRoot, payloadName, maxFileBytes), recordsBytes = await privateRead(preparedRoot, recordsName, maxFileBytes);
      const payload = JSON.parse(payloadBytes.toString("utf8")), records = JSON.parse(recordsBytes.toString("utf8"));
      if ((measured && entry.payloadBytes !== payloadBytes.length) || computeProductionImportPayloadBundleHash(payload) !== entry.payloadBundleSha256 || payload.phase !== phase || records.phase !== phase || records.ordinal !== index ||
          !hashPattern.test(records.sourceBatchManifestSha256 ?? "") || records.sourceBatchManifestSha256 !== payload.sourceBatchManifestSha256 ||
          !eq(payload.targetScope, targetScope, ["tenantId", "parkId", "scopeSha256"]) || !Array.isArray(records.records) || !Array.isArray(payload.records) || records.records.length !== payload.records.length || (measured && records.records.length !== entry.records)) deny();
      const bySource = new Map(payload.records.map(row => [row.sourceIdentitySha256, row])); const seen = new Set();
      if (bySource.size !== records.records.length) deny();
      for (const row of records.records) {
        const source = bySource.get(row.sourceIdentitySha256);
        if (!source || seen.has(row.sourceIdentitySha256) || [row.sourceIdentitySha256, row.sourceRowSha256, row.payloadSha256].some(value => !hashPattern.test(value ?? "")) || !["insert", "quarantine"].includes(row.disposition) || !eq(row, source, ["sourceRowSha256", "payloadSha256"])) deny();
        seen.add(row.sourceIdentitySha256); counts.records++; counts[row.disposition === "insert" ? "inserted" : "quarantined"]++;
      }
      const phaseArtifact = { ref: `${phase}:records`, sha256: sha(recordsBytes) }, payloadArtifact = { ref: `${phase}:payload`, sha256: sha(payloadBytes) };
      pins.set(phaseArtifact.ref, { name: recordsName, hash: phaseArtifact.sha256 }); pins.set(payloadArtifact.ref, { name: payloadName, hash: payloadArtifact.sha256 });
      descriptors.push({ phase, phaseArtifact, payloadArtifact });
    }
    if (!eq(counts, expectedCounts, ["records", "inserted", "quarantined"])) deny();
    const manifestBytes = Buffer.from(JSON.stringify({ binding, target, targetScope, runId, operationId, expectedCounts, httpCounts, phases: descriptors }));
    return { status: "ARTIFACTS_VERIFIED", productionImport: "HOLD", manifestBytes, manifestSha256: sha(manifestBytes),
      readArtifact: async ref => { try { const pin = pins.get(ref); if (!pin) deny(); const value = await privateRead(preparedRoot, pin.name, maxFileBytes); if (sha(value) !== pin.hash) deny(); return value; } catch { throw new Error("LAB_ARTIFACT_READ_DENIED"); } } };
  } catch { throw new Error("LAB_ARTIFACTS_INVALID"); }
}
