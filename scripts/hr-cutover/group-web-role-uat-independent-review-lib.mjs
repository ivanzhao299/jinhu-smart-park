import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyLegacyRuntimePageEvidence } from "./legacy-runtime-page-evidence-lib.mjs";

const IDS = [34, 35, 36, 37, 39, 42, 43, 44, 45, 46, 47, 313];
const ROLES = ["employee", "manager", "web_admin"];
const CHECKS = ["menu", "field", "action", "state", "direct_route", "audit", "no_write", "logout_cleanup"];
const SHA = /^[0-9a-f]{64}$/u;
const sha = value => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value, null, 2)}\n`)).digest("hex");
const rawSha = value => createHash("sha256").update(value).digest("hex");
const exact = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) && exact(Object.keys(value).sort(), [...expected].sort());
const stop = code => { const error = new Error(code); error.code = code; throw error; };
const sensitiveKey = /(?:screen(?:shot)?|dom|html|cookie|password|credential|token|username|personaldata|personname|employeename|phone|email|address|raw(?:value|payload|content))/iu;
const assertMetadataOnly = value => {
  if (Array.isArray(value)) return value.forEach(assertMetadataOnly);
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (sensitiveKey.test(key)) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_SENSITIVE_PAYLOAD");
    assertMetadataOnly(item);
  }
};
const observedTime = value => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || milliseconds > Date.now() + 5 * 60 * 1000) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_OBSERVED_AT_INVALID");
  return milliseconds;
};

export function independentlyReviewGroupWebRoleUat({ root, contract, mapping, sourceAudit, runtimeCoverage, runtimeCoverageRawSha256, deploymentEvidence, deploymentEvidenceRawSha256, authorizationEvidence, authorizationEvidenceRawSha256, runtimeTechnical, runtimeTechnicalRawSha256, collectorBundle, collectorBundleRawSha256, grantSnapshot, grantSnapshotRawSha256, observations, observationsRawSha256, result }) {
  [deploymentEvidence, authorizationEvidence, runtimeTechnical, collectorBundle, grantSnapshot, observations, result].forEach(assertMetadataOnly);
  if (contract?.surface !== "legacy_group_web" || contract?.productionImport !== "HOLD" || contract?.humanAttestation !== "HOLD"
    || !exact(contract.roles, ROLES) || !exact(contract.requiredChecks, CHECKS) || !exact(contract.items?.map(item => item.legacyId), IDS)
    || contract.sourceInventoryHash !== mapping?.sourceInventoryHash || contract.sourceInventoryHash !== sourceAudit?.sourceInventoryHash) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_CONTRACT_INVALID");
  const mappingById = new Map(mapping.items.map(item => [item.legacyId, item]));
  const sourceById = new Map(sourceAudit.items.map(item => [item.legacyId, item]));
  for (const item of contract.items) {
    if (item.legacyRouteSha256 !== rawSha(mappingById.get(item.legacyId)?.legacyUrl ?? "") || item.sourceAuditHash !== sourceById.get(item.legacyId)?.fieldEvidenceHash) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_AUTHORITY_DRIFT");
  }
  let coverageSummary;
  try { coverageSummary = verifyLegacyRuntimePageEvidence(runtimeCoverage); } catch { stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_COVERAGE_INVALID"); }
  if (coverageSummary.surface !== "group_web" || coverageSummary.observations !== 36 || runtimeCoverage.sourceContractSha256 !== contract.legacyRuntimeSourceContractSha256) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_COVERAGE_INVALID");
  const expectedKeys = IDS.flatMap(id => ROLES.map(role => `${id}:${role}`));
  const coverage = new Map();
  for (const row of runtimeCoverage.observations) {
    const role = ROLES.find(candidate => contract.runtimeRoleClasses[candidate] === row.roleClass);
    const item = contract.items.find(candidate => candidate.legacyId === row.legacyId);
    const key = `${row.legacyId}:${role}`;
    if (!role || !item || row.stableId !== `group-web:${item.legacyId}:${row.roleClass}:${item.pageSlug}:page` || row.familyOrDomain !== item.pageSlug
      || row.locatorSha256 !== item.legacyRouteSha256 || row.viewport !== "desktop" || row.artifact.screenshotSha256 !== null || row.artifact.bytes !== 0) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_COVERAGE_ADAPTER_INVALID");
    coverage.set(key, row);
  }
  if (!exact([...coverage.keys()], expectedKeys)) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_COVERAGE_ADAPTER_INVALID");
  if (contract.collectorSourceRawSha256 !== rawSha(readFileSync(resolve(root, contract.collectorSourcePath)))) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_COLLECTOR_SOURCE_DRIFT");
  if (contract.liveCaptureAuthorityRawSha256 !== rawSha(readFileSync(resolve(root, contract.liveCaptureAuthorityPath)))) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_LIVE_AUTHORITY_DRIFT");
  if ([deploymentEvidence, authorizationEvidence, runtimeTechnical].some(value => Object.hasOwn(value, "evidenceClass"))) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_SYNTHETIC_CLASS_INJECTION");
  if (deploymentEvidence?.kind !== "group_web_deployment_identity" || deploymentEvidence.surface !== "legacy_group_web" || deploymentEvidence.captureMode !== "authenticated_readonly"
    || deploymentEvidence.sourceInventoryHash !== contract.sourceInventoryHash || !SHA.test(deploymentEvidence.deploymentSourceManifestSha256 ?? "") || !SHA.test(deploymentEvidence.routeManifestSha256 ?? "") || deploymentEvidence.productionImport !== "HOLD") stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_DEPLOYMENT_INVALID");
  if (authorizationEvidence?.kind !== "group_web_authorization_authority" || authorizationEvidence.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256 || authorizationEvidence.cells?.length !== 36) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_AUTHORIZATION_INVALID");
  const authority = new Map();
  for (const cell of authorizationEvidence.cells) {
    const key = `${cell.legacyId}:${cell.role}`, page = coverage.get(key);
    if (!page || cell.decision !== page.permissionEvidence.expected || cell.directRouteDecision !== page.permissionEvidence.observed || cell.runtimePageObservationSha256 !== page.observationSha256
      || cell.fieldPolicySha256 !== sha(page.fieldEvidence) || cell.actionPolicySha256 !== sha(page.actionEvidence) || cell.statePolicySha256 !== sha(page.stateEvidence)) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_AUTHORIZATION_INVALID");
    authority.set(key, cell);
  }
  if (authority.size !== 36 || runtimeTechnical?.kind !== "group_web_role_uat_runtime_technical" || runtimeTechnical.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256
    || runtimeTechnical.deploymentEvidenceRawSha256 !== deploymentEvidenceRawSha256 || runtimeTechnical.authorizationEvidenceRawSha256 !== authorizationEvidenceRawSha256 || runtimeTechnical.cells?.length !== 36) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_TECHNICAL_INVALID");
  const technical = new Map(), technicalSessions = new Set();
  for (const cell of runtimeTechnical.cells) {
    const key = `${cell.legacyId}:${cell.role}`, auth = authority.get(key);
    if (!auth || cell.runtimePageObservationSha256 !== auth.runtimePageObservationSha256 || cell.menuDecision !== auth.menuDecision || cell.directRouteDecision !== auth.directRouteDecision
      || cell.auditObserved !== true || !SHA.test(cell.auditMetadataSha256 ?? "") || !SHA.test(cell.sourceBeforeSha256 ?? "") || cell.sourceBeforeSha256 !== cell.sourceAfterSha256
      || !SHA.test(cell.sessionIdentitySha256 ?? "") || technicalSessions.has(cell.sessionIdentitySha256) || cell.postLogoutSessionRejected !== true || cell.clientStorageEmpty !== true) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_TECHNICAL_INVALID");
    technicalSessions.add(cell.sessionIdentitySha256); technical.set(key, cell);
  }
  if (technical.size !== 36 || technicalSessions.size !== 36 || collectorBundle?.kind !== "group_web_role_uat_readonly_capture_bundle" || collectorBundle.status !== "CAPTURED_READ_ONLY"
    || collectorBundle.collectorContractSha256 !== contract.collectorContractSha256 || collectorBundle.collectorSourceRawSha256 !== contract.collectorSourceRawSha256
    || collectorBundle.liveCaptureAuthorityRawSha256 !== contract.liveCaptureAuthorityRawSha256 || collectorBundle.liveCaptureAttestationRawSha256 !== null || collectorBundle.legacyRuntimeScoreEligibility !== "HOLD_NO_AUTHORIZED_ATTESTATION"
    || collectorBundle.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256 || collectorBundle.deploymentEvidenceRawSha256 !== deploymentEvidenceRawSha256
    || collectorBundle.authorizationEvidenceRawSha256 !== authorizationEvidenceRawSha256 || collectorBundle.runtimeTechnicalRawSha256 !== runtimeTechnicalRawSha256
    || collectorBundle.cells !== 36 || collectorBundle.productionImport !== "HOLD" || !SHA.test(collectorBundleRawSha256 ?? "")) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_COLLECTOR_BUNDLE_INVALID");
  const provenance = grantSnapshot?.captureProvenance;
  if (grantSnapshot?.surface !== "legacy_group_web" || grantSnapshot.captureMode !== "authenticated_readonly" || grantSnapshot.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256
    || provenance?.collectorContractSha256 !== contract.collectorContractSha256 || provenance?.collectorSourceRawSha256 !== contract.collectorSourceRawSha256 || provenance?.collectorBundleRawSha256 !== collectorBundleRawSha256
    || provenance?.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256 || provenance?.deploymentEvidenceRawSha256 !== deploymentEvidenceRawSha256
    || provenance?.authorizationEvidenceRawSha256 !== authorizationEvidenceRawSha256 || provenance?.runtimeTechnicalRawSha256 !== runtimeTechnicalRawSha256 || !exact(grantSnapshot.roles?.map(row => row.role), ROLES)) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_PROVENANCE_INVALID");
  const grantObservedAt = observedTime(grantSnapshot.observedAt);
  const grants = new Map();
  const sessions = new Set();
  const subjects = new Set();
  const contexts = new Set();
  for (const roleRow of grantSnapshot.roles) {
    if (!SHA.test(roleRow.subjectIdentitySha256 ?? "") || !SHA.test(roleRow.authorizationContextSha256 ?? "") || subjects.has(roleRow.subjectIdentitySha256) || contexts.has(roleRow.authorizationContextSha256) || !exact(roleRow.grants?.map(row => row.legacyId), IDS)) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_GRANT_INVALID");
    subjects.add(roleRow.subjectIdentitySha256); contexts.add(roleRow.authorizationContextSha256);
    for (const grant of roleRow.grants) {
      const key = `${grant.legacyId}:${roleRow.role}`;
      const page = coverage.get(key);
      const auth = authority.get(key), runtime = technical.get(key);
      if (!page || !auth || !runtime || !["visible", "hidden"].includes(grant.menuDecision) || grant.decision !== page.permissionEvidence.expected || grant.directRouteDecision !== page.permissionEvidence.observed || grant.decision !== grant.directRouteDecision
        || grant.runtimePageObservationSha256 !== page.observationSha256 || grant.fieldPolicySha256 !== sha(page.fieldEvidence) || grant.actionPolicySha256 !== sha(page.actionEvidence)
        || grant.statePolicySha256 !== sha(page.stateEvidence) || grant.sessionIdentitySha256 !== runtime.sessionIdentitySha256
        || JSON.stringify({ legacyId: grant.legacyId, role: roleRow.role, decision: grant.decision, menuDecision: grant.menuDecision, directRouteDecision: grant.directRouteDecision, fieldPolicySha256: grant.fieldPolicySha256, actionPolicySha256: grant.actionPolicySha256, statePolicySha256: grant.statePolicySha256, runtimePageObservationSha256: grant.runtimePageObservationSha256 }) !== JSON.stringify(auth)
        || !SHA.test(grant.sessionIdentitySha256 ?? "") || sessions.has(grant.sessionIdentitySha256)) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_GRANT_INVALID");
      sessions.add(grant.sessionIdentitySha256);
      grants.set(key, { ...grant, role: roleRow.role, subjectIdentitySha256: roleRow.subjectIdentitySha256, authorizationContextSha256: roleRow.authorizationContextSha256 });
    }
  }
  if (sessions.size !== 36 || grants.size !== 36 || expectedKeys.some(key => !grants.has(key))) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_SESSION_INVALID");
  for (const id of IDS) {
    const decisions = ROLES.map(role => grants.get(`${id}:${role}`).decision);
    if (!decisions.includes("allow") || !decisions.includes("deny")) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_ALLOW_DENY_INVALID");
  }
  if (observations?.surface !== "legacy_group_web" || observations.captureMode !== "authenticated_readonly" || observations.grantSnapshotRawSha256 !== grantSnapshotRawSha256
    || observations.humanAttestation !== "HOLD" || observations.productionImport !== "HOLD" || !exact(observations.cells?.map(cell => `${cell.legacyId}:${cell.role}`), expectedKeys)) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_OBSERVATION_INVALID");
  const observationsObservedAt = observedTime(observations.observedAt);
  if (observationsObservedAt < grantObservedAt || observationsObservedAt - grantObservedAt > 24 * 60 * 60 * 1000) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_OBSERVED_AT_INVALID");
  const evidenceHashes = new Set();
  const expectedResultCells = [];
  for (const cell of observations.cells) {
    const key = `${cell.legacyId}:${cell.role}`;
    const grant = grants.get(key);
    const grantPayload = { legacyId: grant.legacyId, role: grant.role, decision: grant.decision, menuDecision: grant.menuDecision, directRouteDecision: grant.directRouteDecision, fieldPolicySha256: grant.fieldPolicySha256, actionPolicySha256: grant.actionPolicySha256, statePolicySha256: grant.statePolicySha256, runtimePageObservationSha256: grant.runtimePageObservationSha256, sessionIdentitySha256: grant.sessionIdentitySha256, subjectIdentitySha256: grant.subjectIdentitySha256, authorizationContextSha256: grant.authorizationContextSha256 };
    if (cell.decision !== grant.decision || cell.grantCellSha256 !== sha(grantPayload) || cell.sessionIdentitySha256 !== grant.sessionIdentitySha256 || !keys(cell.checks, CHECKS)) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_CELL_INVALID");
    const runtime = technical.get(key), menu = cell.checks.menu, direct = cell.checks.direct_route, audit = cell.checks.audit, noWrite = cell.checks.no_write, logout = cell.checks.logout_cleanup;
    if (!keys(menu, ["status", "expectedDecision", "observedDecision", "runtimePageObservationSha256", "observationSha256"])
      || !keys(direct, ["status", "expectedDecision", "observedDecision", "observationSha256"])
      || !keys(audit, ["status", "auditObserved", "auditMetadataSha256", "observationSha256"])
      || !keys(noWrite, ["status", "beforeSha256", "afterSha256", "observationSha256"])
      || !keys(logout, ["status", "sessionIdentitySha256", "postLogoutSessionRejected", "clientStorageEmpty", "observationSha256"])
      || menu.expectedDecision !== grant.menuDecision || menu.observedDecision !== runtime.menuDecision || menu.runtimePageObservationSha256 !== runtime.runtimePageObservationSha256
      || direct.expectedDecision !== grant.directRouteDecision || direct.observedDecision !== runtime.directRouteDecision || audit.auditObserved !== runtime.auditObserved || audit.auditMetadataSha256 !== runtime.auditMetadataSha256
      || noWrite.beforeSha256 !== runtime.sourceBeforeSha256 || noWrite.afterSha256 !== runtime.sourceAfterSha256 || noWrite.beforeSha256 !== noWrite.afterSha256
      || logout.sessionIdentitySha256 !== runtime.sessionIdentitySha256 || logout.postLogoutSessionRejected !== runtime.postLogoutSessionRejected || logout.clientStorageEmpty !== runtime.clientStorageEmpty) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_SEMANTIC_INVALID");
    for (const [name, policy] of [["field", grant.fieldPolicySha256], ["action", grant.actionPolicySha256], ["state", grant.statePolicySha256]]) if (!keys(cell.checks[name], ["status", "policySha256", "observationSha256"]) || cell.checks[name].policySha256 !== policy) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_SEMANTIC_INVALID");
    for (const name of CHECKS) {
      const check = cell.checks[name];
      const semanticEvidence = Object.fromEntries(Object.entries(check).filter(([field]) => field !== "observationSha256"));
      if (check.status !== "PASS" || check.observationSha256 !== sha({ key, checkName: name, semanticEvidence }) || evidenceHashes.has(check.observationSha256)) stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_EVIDENCE_INVALID");
      evidenceHashes.add(check.observationSha256);
    }
    expectedResultCells.push({ legacyId: cell.legacyId, role: cell.role, decision: cell.decision, cellSha256: sha(cell) });
  }
  const expectedSummary = { entries: 12, roles: 3, cells: 36, sessions: 36, allowDenyPairs: 12, checksPerCell: 8, passedChecks: 288 };
  if (!keys(result, ["formatVersion", "resultKind", "status", "surface", "sourceInventoryHash", "contractSha256", "runtimeCoverageRawSha256", "collectorBundleRawSha256", "liveCaptureAuthorityRawSha256", "liveCaptureAttestationRawSha256", "legacyRuntimeScoreEligibility", "grantSnapshotRawSha256", "observationsRawSha256", "observedAt", "roles", "legacyIds", "cells", "summary", "evidencePolicy", "clientEvidenceSubstitution", "humanAttestation", "productionImport"])
    || result.cells?.some(cell => !keys(cell, ["legacyId", "role", "decision", "cellSha256"]))
    || result?.formatVersion !== 1 || result.resultKind !== "group_web_role_uat_machine_result" || result.status !== "PASS" || result.surface !== "legacy_group_web" || result.sourceInventoryHash !== contract.sourceInventoryHash
    || result.observedAt !== observations.observedAt || !exact(result.roles, ROLES) || !exact(result.legacyIds, IDS)
    || !exact(result.evidencePolicy, { externalOnly: true, directoryMode: "0700", fileMode: "0600", payload: "hash_and_metadata_only" })
    || result.contractSha256 !== sha(contract) || result.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256 || result.collectorBundleRawSha256 !== collectorBundleRawSha256
    || result.liveCaptureAuthorityRawSha256 !== contract.liveCaptureAuthorityRawSha256 || result.liveCaptureAttestationRawSha256 !== collectorBundle.liveCaptureAttestationRawSha256 || result.legacyRuntimeScoreEligibility !== collectorBundle.legacyRuntimeScoreEligibility
    || result.grantSnapshotRawSha256 !== grantSnapshotRawSha256 || result.observationsRawSha256 !== observationsRawSha256 || !exact(result.cells, expectedResultCells)
    || !exact(result.summary, expectedSummary) || result.clientEvidenceSubstitution !== "FORBIDDEN" || result.humanAttestation !== "HOLD" || result.productionImport !== "HOLD") stop("GROUP_WEB_ROLE_UAT_INDEPENDENT_RESULT_DRIFT");
  return { status: "MACHINE_VERIFIED", summary: expectedSummary, contractSha256: sha(contract), liveCaptureAuthorityRawSha256: contract.liveCaptureAuthorityRawSha256, liveCaptureAttestationRawSha256: collectorBundle.liveCaptureAttestationRawSha256, legacyRuntimeScoreEligibility: collectorBundle.legacyRuntimeScoreEligibility };
}
