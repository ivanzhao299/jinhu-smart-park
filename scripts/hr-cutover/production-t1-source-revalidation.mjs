import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifyProductionSourceManifest } from "../prepare-yuzhou-production-source-manifest.mjs";
import { verifyT1EventTypeDecision, verifyT1EventTypeStaging } from "./verify-yuzhou-t1-event-type-decision.mjs";
import { canonicalHash } from "./materialize-reviewed-job-state.mjs";
import { evaluateCoreT1StatePolicy } from "./materialize-core-non-t0-dictionaries.mjs";

const policy = JSON.parse(readFileSync(new URL("./contracts/yuzhou-t1-employment-event-type-decision-v1.json", import.meta.url), "utf8"));
verifyT1EventTypeDecision(policy);
const withoutKey = (value, excluded) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== excluded));
const typePolicy = new Map(policy.decisions.map(value => { const row = withoutKey(value, "usageCount"); return [row.sourceValue, row]; }));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const SHA = /^[0-9a-f]{64}$/u;
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const fail = code => { const error = new Error(`PRODUCTION_IMPORT_T1_SOURCE_REVALIDATION_${code}`); error.code = error.message; throw error; };
const exact = (value, keys) => { if (!plain(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("SHAPE_INVALID"); };
const bytesOf = value => { if (!(value instanceof Uint8Array) || value.byteLength > 32 * 1024 ** 2) fail("BYTES_INVALID"); return Buffer.from(value); };
const parse = bytes => { try { return JSON.parse(bytes.toString("utf8")); } catch { fail("JSON_INVALID"); } };
const tripleCheck = value => {
  exact(value, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (typeof value.codeSha !== "string" || !/^[0-9a-f]{40}$/u.test(value.codeSha) || typeof value.sourceSnapshotHash !== "string" || !SHA.test(value.sourceSnapshotHash) || typeof value.mappingContractHash !== "string" || !SHA.test(value.mappingContractHash)) fail("TRIPLE_INVALID");
};
const files = { employmentEvents: "employment-events.jsonl", employmentEventTypes: "employment-event-types.json", employmentEventStates: "employment-event-states.json" };

/** Only semantic reuse; original package C/M and checkpoint are never current approvals. */
export function verifyProductionT1SourceRevalidation({ triple, sourceManifest, stageManifestBytes, stageBytes, typeDecision, statePackage }) {
  tripleCheck(triple);
  try { verifyProductionSourceManifest(sourceManifest); } catch { fail("SOURCE_MANIFEST_INVALID"); }
  if (sourceManifest.sourceSnapshotSha256 !== triple.sourceSnapshotHash || sourceManifest.mappingContractSha256 !== triple.mappingContractHash) fail("SOURCE_BINDING_MISMATCH");
  const manifestBytes = bytesOf(stageManifestBytes), manifest = parse(manifestBytes);
  if (hash(manifestBytes) !== sourceManifest.phases.T1.stageManifestSha256 || !plain(manifest) || manifest.formatVersion !== 1) fail("MANIFEST_MISMATCH");
  exact(manifest.domains, Object.keys(files)); exact(stageBytes, Object.keys(files));
  for (const key of ["sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceCatalogSha256", "mappingContractSha256"]) if (manifest[key] !== undefined && manifest[key] !== sourceManifest[key]) fail("SOURCE_BINDING_MISMATCH");
  if (manifest.productionImport !== undefined && manifest.productionImport !== "HOLD") fail("SOURCE_BINDING_MISMATCH");
  const parsed = {}, hashes = {};
  for (const [key, file] of Object.entries(files)) {
    const domain = manifest.domains[key], expected = sourceManifest.phases.T1.domains[key];
    exact(domain, ["rows", "file", "fileSha256"]);
    const bytes = bytesOf(stageBytes[key]); hashes[key] = hash(bytes);
    if (domain.file !== file || domain.rows !== expected.rows || domain.fileSha256 !== expected.fileSha256 || hashes[key] !== expected.fileSha256) fail("DOMAIN_MISMATCH");
    const rows = key === "employmentEvents" ? bytes.toString("utf8").split("\n").filter(Boolean).map(line => parse(Buffer.from(line))) : parse(bytes);
    if (!Array.isArray(rows) || rows.length !== domain.rows) fail("COUNT_MISMATCH");
    parsed[key] = rows;
  }
  const events = parsed.employmentEvents, typeUsage = new Map(), stateUsage = new Map(), seenEvents = new Set();
  for (const row of events) {
    exact(row, ["sourceTable", "sourceKey", "sourceIdentitySha256", "sourceRowSha256", "source"]);
    if (row.sourceTable !== "dbo.readjust" || typeof row.sourceKey !== "string" || !row.sourceKey.trim() || !plain(row.source)
      || row.sourceIdentitySha256 !== hash(`dbo.readjust\0${row.sourceKey}`) || row.sourceRowSha256 !== hash(JSON.stringify(row.source, Object.keys(row.source).sort())) || seenEvents.has(row.sourceIdentitySha256)) fail("EVENT_INVALID");
    seenEvents.add(row.sourceIdentitySha256);
    for (const [field, counts] of [["legacyEventType", typeUsage], ["legacyState", stateUsage]]) {
      const value = row.source[field];
      if (typeof value !== "string" || !value.trim()) fail("USAGE_INVALID");
      const key = value.trim(); counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  function usageCheck(rows, counts) {
    const seen = new Set();
    for (const row of rows) {
      exact(row, ["sourceValue", "usageCount"]);
      if (typeof row.sourceValue !== "string" || row.sourceValue.trim() !== row.sourceValue || !row.sourceValue || seen.has(row.sourceValue)
        || !Number.isSafeInteger(row.usageCount) || row.usageCount < 1 || counts.get(row.sourceValue) !== row.usageCount) fail("USAGE_MISMATCH");
      seen.add(row.sourceValue);
    }
    if (seen.size !== counts.size) fail("USAGE_MISMATCH");
  }
  usageCheck(parsed.employmentEventTypes, typeUsage); usageCheck(parsed.employmentEventStates, stateUsage);
  let verified;
  try { verified = verifyT1EventTypeStaging(typeDecision, parsed.employmentEventTypes); } catch { fail("TYPE_DECISION_INVALID"); }
  if (verified.sourceSnapshotSha256 !== triple.sourceSnapshotHash || verified.sourceRecordCount !== events.length) fail("TYPE_BINDING_MISMATCH");
  for (const value of typeDecision.decisions) {
    const row = withoutKey(value, "usageCount");
    if (!typePolicy.has(row.sourceValue) || canonicalHash(row) !== canonicalHash(typePolicy.get(row.sourceValue))) fail("TYPE_POLICY_MISMATCH");
  }
  exact(statePackage, ["formatVersion", "kind", "triple", "trustedRootSha256", "machineActor", "evidence", "dictionaries", "productionImport"]);
  tripleCheck(statePackage.triple);
  if (statePackage.formatVersion !== 1 || statePackage.kind !== "yuzhou_core_non_t0_machine_dictionary_package" || statePackage.productionImport !== "HOLD"
    || statePackage.triple.sourceSnapshotHash !== triple.sourceSnapshotHash || typeof statePackage.trustedRootSha256 !== "string" || !SHA.test(statePackage.trustedRootSha256) || !Array.isArray(statePackage.dictionaries)) fail("STATE_PACKAGE_INVALID");
  exact(statePackage.machineActor, ["id", "kind", "verifiedAt"]);
  if (statePackage.machineActor.kind !== "machine_policy_engine" || !Number.isFinite(Date.parse(statePackage.machineActor.verifiedAt))) fail("STATE_PACKAGE_INVALID");
  exact(statePackage.evidence, ["t1Types", "t1States", "t2Types", "t2States"]);
  if (Object.values(statePackage.evidence).some(value => typeof value !== "string" || !SHA.test(value)) || statePackage.evidence.t1Types !== hashes.employmentEventTypes || statePackage.evidence.t1States !== hashes.employmentEventStates) fail("STATE_SOURCE_MISMATCH");
  if (statePackage.dictionaries.map(row => row?.dictionaryCode).sort().join("|") !== ["contract_state", "contract_type", "employment_event_state", "employment_event_type"].join("|")) fail("STATE_PACKAGE_INVALID");
  const dictionary = statePackage.dictionaries.find(row => row.dictionaryCode === "employment_event_state");
  exact(dictionary, ["dictionaryCode", "sourceTable", "sourceSnapshotSha256", "items", "machineAttestationSha256"]);
  if (dictionary.sourceTable !== "dbo.readjust" || dictionary.sourceSnapshotSha256 !== canonicalHash({ kind: "employment_event_state", source: hashes.employmentEventStates }) || !Array.isArray(dictionary.items) || dictionary.items.length !== stateUsage.size) fail("STATE_SOURCE_MISMATCH");
  const stateMappings = new Map();
  for (const row of dictionary.items) {
    exact(row, ["id", "sourceCode", "sourceName", "sourceValue", "sourceIdentitySha256", "sourceRowSha256", "decision", "targetDomain", "targetValue", "reasonCode"]);
    const key = row.sourceValue, rule = evaluateCoreT1StatePolicy(key);
    if (!stateUsage.has(key) || stateMappings.has(key) || rule === null || row.sourceCode !== null || row.sourceName !== null
      || row.sourceIdentitySha256 !== hash(`dbo.readjust.state\0${key}`) || row.sourceRowSha256 !== canonicalHash({ sourceCode: null, sourceName: null, sourceValue: key })
      || row.decision !== rule.decision || row.targetDomain !== (rule.decision === "map" ? "migration_decision" : null) || row.targetValue !== rule.target || row.reasonCode !== rule.reason) fail("STATE_POLICY_MISMATCH");
    stateMappings.set(key, Object.freeze({ ...row }));
  }
  if (dictionary.machineAttestationSha256 !== canonicalHash({ triple: statePackage.triple, trustedRootSha256: statePackage.trustedRootSha256, dictionaryCode: dictionary.dictionaryCode, sourceSnapshotSha256: dictionary.sourceSnapshotSha256, items: dictionary.items.map(row => withoutKey(row, "id")) })) fail("STATE_ATTESTATION_MISMATCH");
  return Object.freeze({ typeMappings: new Map(typeDecision.decisions.map(row => [row.sourceValue, Object.freeze({ ...row })])), stateMappings, sourceRecordCount: events.length, originalTriple: Object.freeze({ ...statePackage.triple }) });
}
