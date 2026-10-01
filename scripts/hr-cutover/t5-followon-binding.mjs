import { canonicalT4, exactT4, hashT4, sameT4, shaT4 } from "./production-import-t4-followon-binding.mjs";
import { validateProductionImportSingleOwnerPolicy } from "./production-import-approval-policy.mjs";
import { T5_FULL_COUNTS } from "./t5-full-archive-private-stage.mjs";

export const T5_FOLLOWON_COUNTS = Object.freeze({ sourceRecords: 20163, typedSourceRecords: 7752,
  typedProjectionRecords: 63992, definitions: 19, logicColumns: 190, presentLogicColumns: 95,
  coreEmployees: 2938 });
const OPERATION = /^yzprod-import-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/u;
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function validateT5FollowonBinding(binding) {
  exactT4(binding, ["formatVersion", "artifactKind", "intent", "operationId", "actorId", "triple", "executionCodeSha",
    "parent", "payrollParent", "targetIdentitySha256", "targetScopeSha256", "targetScope", "finalRehearsalPairSha256",
    "manifestSha256", "sourceMappingContractSha256", "sourceBusinessSha256", "sourceCatalogSha256",
    "sourceRestoreReceiptSha256", "files", "counts", "windowStartsAt", "windowEndsAt", "runtimeReceiptSha256",
    "productionKeyObservationSha256", "photoBundleSha256", "photoSourceCustodySha256", "photoNormalizationReceiptSha256", "photoWorkerImageId"]);
  if (binding.formatVersion !== 1 || binding.artifactKind !== "yuzhou_t5_followon_binding"
    || binding.intent !== "APPEND_T5_FULL_HISTORY_ONCE" || !OPERATION.test(binding.operationId ?? "")) fail("T5_FOLLOWON_INTENT_INVALID");
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(binding.actorId ?? "")) fail("T5_FOLLOWON_ACTOR_INVALID");
  exactT4(binding.triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"]);
  if (![binding.triple.codeSha, binding.executionCodeSha].every(value => /^[a-f0-9]{40}$/u.test(value ?? ""))) fail("T5_FOLLOWON_CODE_INVALID");
  exactT4(binding.targetScope, ["tenantId", "parkId", "scopeSha256"]);
  if (![binding.targetScope.tenantId, binding.targetScope.parkId].every(value => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value ?? ""))
    || binding.targetScope.scopeSha256 !== binding.targetScopeSha256) fail("T5_FOLLOWON_SCOPE_INVALID");
  exactT4(binding.parent, ["operationId", "sealedPlanSha256", "receiptSha256", "recordSetSha256", "payloadBundleSha256"]);
  exactT4(binding.parent.payloadBundleSha256, ["T0", "T1", "T2", "T3"]);
  exactT4(binding.payrollParent, ["operationId", "bindingSha256", "ownedStateSha256", "receiptSha256"]);
  const operations = [binding.operationId, binding.parent.operationId, binding.payrollParent.operationId];
  if (!operations.every(value => OPERATION.test(value ?? "")) || new Set(operations).size !== 3) fail("T5_FOLLOWON_PARENT_INVALID");
  exactT4(binding.files, [...Object.keys(T5_FULL_COUNTS), "catalog", "definitions", "safeDefinitionEvidence"]);
  [binding.triple.sourceSnapshotHash, binding.triple.mappingContractHash, binding.targetIdentitySha256,
    binding.targetScopeSha256, binding.finalRehearsalPairSha256, binding.manifestSha256,
    binding.sourceMappingContractSha256, binding.sourceBusinessSha256, binding.sourceCatalogSha256,
    binding.sourceRestoreReceiptSha256, binding.runtimeReceiptSha256, binding.productionKeyObservationSha256,
    binding.photoBundleSha256, binding.photoSourceCustodySha256, binding.photoNormalizationReceiptSha256,
    binding.parent.sealedPlanSha256, binding.parent.receiptSha256, binding.parent.recordSetSha256,
    binding.payrollParent.bindingSha256, binding.payrollParent.ownedStateSha256, binding.payrollParent.receiptSha256,
    ...Object.values(binding.parent.payloadBundleSha256), ...Object.values(binding.files)].forEach(shaT4);
  if (!/^sha256:[a-f0-9]{64}$/u.test(binding.photoWorkerImageId ?? "")) fail("T5_PHOTO_WORKER_INVALID");
  if (binding.sourceMappingContractSha256 !== "d44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0"
    || !sameT4(binding.counts, T5_FOLLOWON_COUNTS)) fail("T5_FOLLOWON_SOURCE_CONTRACT_INVALID");
  const start = Date.parse(binding.windowStartsAt), end = Date.parse(binding.windowEndsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 60 * 60 * 1000) fail("T5_FOLLOWON_WINDOW_INVALID");
  return binding;
}

export function validateT5FollowonAuthorization({ binding, authorization, intent = "append", now = new Date() }) {
  validateT5FollowonBinding(binding);
  if (!["append", "rollback"].includes(intent)) fail("T5_FOLLOWON_INTENT_INVALID");
  exactT4(authorization, ["context", "approvalPolicy", "approvalSet"]);
  const expected = intent === "append" ? binding : { ...binding, intent: "ROLLBACK_T5_FULL_HISTORY_ONCE" };
  if (!sameT4(authorization.context.binding, expected) || authorization.context.operationId !== binding.operationId
    || !sameT4(authorization.context.payloadBundleSha256, binding.parent.payloadBundleSha256)) fail("T5_FOLLOWON_AUTHORIZATION_BINDING_DRIFT");
  validateProductionImportSingleOwnerPolicy(authorization);
  const time = new Date(now).getTime();
  if (!Number.isFinite(time) || time < Date.parse(authorization.context.issuedAt)
    || time >= Date.parse(authorization.context.expiresAt)) fail("T5_FOLLOWON_AUTHORIZATION_EXPIRED");
  return hashT4(canonicalT4(authorization));
}

export function assertT5FollowonStageBinding(stageInput, binding) {
  validateT5FollowonBinding(binding);
  if (stageInput.manifest.sha256 !== binding.manifestSha256
    || !sameT4(Object.keys(stageInput.files).sort(), Object.keys(T5_FULL_COUNTS).sort())) fail("T5_FOLLOWON_STAGE_BINDING_DRIFT");
  for (const name of Object.keys(T5_FULL_COUNTS)) if (stageInput.files[name].sha256 !== binding.files[name]) fail("T5_FOLLOWON_STAGE_BINDING_DRIFT");
  for (const name of ["catalog", "definitions", "safeDefinitionEvidence"])
    if (stageInput[name].sha256 !== binding.files[name]) fail("T5_FOLLOWON_STAGE_BINDING_DRIFT");
  return { manifestSha256: binding.manifestSha256, businessSha256: binding.sourceBusinessSha256,
    catalogSha256: binding.sourceCatalogSha256, mappingContractSha256: binding.sourceMappingContractSha256 };
}
