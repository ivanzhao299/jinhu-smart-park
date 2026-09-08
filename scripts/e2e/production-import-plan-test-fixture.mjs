/* global Buffer, structuredClone */
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeProductionImportPlan } from "../hr-cutover/materialize-production-import-plan.mjs";
import { DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT as DEFAULT, computeProductionImportPayloadHash as hash,
  computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { computeProductionImportBusinessIdentityHash, computeProductionImportTargetCanonicalHash, deriveProductionImportTargetId } from "../hr-cutover/production-import-target-model.mjs";
import { createProductionImportSingleOwnerPolicy, productionImportOperatorPublicKeyHash } from "../hr-cutover/production-import-approval-policy.mjs";
const H = s => createHash("sha256").update(s).digest("hex");
const NOW = new Date("2026-09-09T01:00:00.000Z"), PHASES = ["T0", "T1", "T2", "T3"];
export function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "plan-producer-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, value) => { const path = join(root, name), bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n"); writeFileSync(path, bytes, { mode: 0o600 }); return { path, sha256: H(bytes) }; };
  const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: H("source"), mappingContractHash: H("mapping") };
  const targetScope = { tenantId: "tenant-synthetic", parkId: "park-synthetic" }; targetScope.scopeSha256 = computeProductionImportTargetScopeHash(targetScope);
  const target = { environment: "production", alias: "synthetic-production", identitySha256: H("target") };
  const contract = structuredClone(DEFAULT); contract.activation.allowedTargets = [{ ...target, targetScopeSha256: targetScope.scopeSha256 }];
  const metadata = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_plan_metadata", operationId: "yzprod-import-20260909T010000Z-aaaaaaaaaaaa", triple, target, targetScope,
    window: { startsAt: "2026-09-09T00:00:00.000Z", endsAt: "2026-09-09T03:00:00.000Z" },
    finalRehearsalPair: { artifactSha256: H("pair"), triple, rehearsals: ["A", "B"].map(rehearsal => ({ rehearsal, manifestSha256: H(rehearsal), cleanupAuditSha256: H(`clean-${rehearsal}`), residualCount: 0 })) }, productionImport: "HOLD" };
  const runtime = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_runtime_release_receipt", currentCodeSha: triple.codeSha, mergedCodeSha: triple.codeSha, runtimeCodeSha: triple.codeSha,
    targetIdentitySha256: target.identitySha256, targetScopeSha256: targetScope.scopeSha256, observedAt: "2026-09-09T00:10:00.000Z", expiresAt: "2026-09-09T01:30:00.000Z" };
  const baseline = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_touched_baseline", triple, targetIdentitySha256: target.identitySha256, targetScope,
    observedAt: runtime.observedAt, expiresAt: runtime.expiresAt, phases: {}, productionImport: "HOLD" };
  const payload = { org_code: "SYN", org_name: "Synthetic", org_type: "department", sort_order: 1, status: "enabled", remark: null, contact_phone: null, planned_headcount: null, legacy_source_id: 1 };
  const identity = H("org"), targetId = deriveProductionImportTargetId({ targetScope, targetTable: "sys_org", sourceIdentitySha256: identity });
  const record = { sourceSystem: "yuzhou-v10", sourceTable: "dbo.departmentcode", sourcePkCanonical: `sha256:${identity}`, sourceIdentitySha256: identity, sourceRowSha256: H("row"), payloadSha256: hash(payload), plannedTargetTable: "sys_org",
    dependencyMode: "scope", dependencyRefs: [], disposition: "insert", targetTable: "sys_org", targetId, targetVersionAfter: 1,
    businessIdentitySha256: computeProductionImportBusinessIdentityHash("sys_org", targetScope, payload, { parent_id: null }), expectedTargetAfterSha256: computeProductionImportTargetCanonicalHash("sys_org", targetScope, payload, { parent_id: null }) };
  const phaseDescriptors = {};
  for (const [ordinal, phase] of PHASES.entries()) {
    const records = phase === "T0" ? [record] : [], sourceBatchManifestSha256 = H(phase);
    const bundle = { formatVersion: 2, artifactKind: "yuzhou_hr_production_import_payload_bundle", phase, targetScope, canonicalizationVersion: DEFAULT.canonicalizationVersion, sourceBatchManifestSha256,
      records: records.map(r => ({ sourceIdentitySha256: r.sourceIdentitySha256, sourceRowSha256: r.sourceRowSha256, targetTable: r.targetTable, payloadSha256: r.payloadSha256, payload })) };
    phaseDescriptors[phase] = { payload: put(`${phase}-payload.json`, bundle), records: put(`${phase}-records.json`, { phase, ordinal, sourceBatchManifestSha256, records }) };
    baseline.phases[phase] = { rows: [], absent: records.map(r => ({ targetTable: r.targetTable, targetId: r.targetId })) };
  }
  const outputDir = join(root, "draft"); mkdirSync(outputDir, { mode: 0o700 });
  const config = { formatVersion: 1, mode: "draft", triple, artifacts: { metadata: put("metadata.json", metadata), runtime: put("runtime.json", runtime), baseline: put("baseline.json", baseline), phases: phaseDescriptors }, outputDir };
  const run = () => materializeProductionImportPlan(put("config.json", config).path, { now: NOW, currentHead: () => triple.codeSha, contract });
  const seal = () => {
    const draft = JSON.parse(readFileSync(join(outputDir, "plan-draft.json"), "utf8"));
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const confirmation = { formatVersion: 1, artifactKind: "yuzhou_hr_single_owner_confirmation", provenance: "explicit_user_confirmation", decision: "AUTHORIZE_DELEGATED_OPERATION",
      ownerSubjectRefSha256: H("synthetic-owner"), confirmationEvidenceSha256: H("synthetic-confirmation"), operatorSubjectRefSha256: H("synthetic-operator"), operatorPublicKeySha256: productionImportOperatorPublicKeyHash(publicKey.export({ type: "spki", format: "pem" })),
      context: { operationId: metadata.operationId, binding: draft.authorizationBinding, issuedAt: "2026-09-09T00:30:00.000Z", expiresAt: "2026-09-09T02:00:00.000Z", nonceSha256: H("nonce"),
        preparationArtifacts: { preparedSha256: H("prepared"), reviewedSha256: H("reviewed"), bridgeEvidenceSha256: H("bridge") }, payloadBundleSha256: Object.fromEntries(draft.unsignedPlan.phases.map(p => [p.phase, p.payloadBundleSha256])) } };
    const authorization = { intent: "production_import", artifactSha256: H("external-authorization"), nonceSha256: confirmation.context.nonceSha256, issuedAt: confirmation.context.issuedAt, expiresAt: confirmation.context.expiresAt,
      binding: draft.authorizationBinding, ...createProductionImportSingleOwnerPolicy({ confirmation, operatorSigningKey: privateKey }) };
    config.mode = "seal"; config.artifacts.draft = { path: join(outputDir, "plan-draft.json"), sha256: H(readFileSync(join(outputDir, "plan-draft.json"))) };
    config.artifacts.authorization = put("authorization.json", authorization); config.outputDir = join(root, "seal"); mkdirSync(config.outputDir, { mode: 0o700 });
    return { draft, authorization };
  };
  return { root, put, config, run, seal, baseline, metadata, runtime, contract, triple };
}


