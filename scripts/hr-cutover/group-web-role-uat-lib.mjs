import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { verifyLegacyRuntimePageEvidence } from "./legacy-runtime-page-evidence-lib.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const CURRENT_UID = typeof process.getuid === "function" ? process.getuid() : null;
const EXPECTED_IDS = Object.freeze([34, 35, 36, 37, 39, 42, 43, 44, 45, 46, 47, 313]);
const EXPECTED_ROLES = Object.freeze(["employee", "manager", "web_admin"]);
const EXPECTED_CHECKS = Object.freeze(["menu", "field", "action", "state", "direct_route", "audit", "no_write", "logout_cleanup"]);
const SENSITIVE_KEY = /(?:screen(?:shot)?|dom|html|cookie|password|credential|token|username|personaldata|personname|employeename|phone|email|address|raw(?:value|payload|content))/iu;

export class GroupWebRoleUatError extends Error {
  constructor(code, detail = "") {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "GroupWebRoleUatError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebRoleUatError(code, detail); };
export const groupWebRoleUatSha256 = value => createHash("sha256").update(Buffer.isBuffer(value) ? value : canonicalBytes(value)).digest("hex");
const rawSha256 = value => createHash("sha256").update(value).digest("hex");
export const canonicalBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const mode = info => (info.mode & 0o777).toString(8).padStart(4, "0");
const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino;
const sameFileSnapshot = (left, right) => sameIdentity(left, right) && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
const exactKeys = (value, keys, code, detail) => {
  if (!plainObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, detail);
};
const exactArray = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

function assertNoSensitiveKeys(value, path = "$") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSensitiveKeys(item, `${path}[${index}]`));
  if (!plainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) fail("GROUP_WEB_ROLE_UAT_SENSITIVE_PAYLOAD", `${path}.${key}`);
    assertNoSensitiveKeys(item, `${path}.${key}`);
  }
}

function observedTime(value, code) {
  if (!ISO_TIME.test(value ?? "")) fail(code);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || milliseconds > Date.now() + 5 * 60 * 1000) fail("GROUP_WEB_ROLE_UAT_OBSERVED_AT_FUTURE");
  return milliseconds;
}

function privateDirectorySnapshot(directoryPath, code) {
  const candidate = resolve(directoryPath);
  try {
    if (realpathSync(candidate) !== candidate) fail(code);
    const info = lstatSync(candidate);
    if (!info.isDirectory() || info.isSymbolicLink() || mode(info) !== "0700" || (CURRENT_UID !== null && info.uid !== CURRENT_UID)) fail(code);
    return { path: candidate, info };
  } catch (error) {
    if (error instanceof GroupWebRoleUatError) throw error;
    fail(code);
  }
}

export function readExternalEvidence(inputPath, root, code = "GROUP_WEB_ROLE_UAT_SOURCE_UNSAFE", afterReadHook = () => {}) {
  const candidate = resolve(inputPath);
  const repo = resolve(root);
  if (candidate === repo || !relative(repo, candidate).startsWith("..")) fail("GROUP_WEB_ROLE_UAT_EVIDENCE_MUST_BE_EXTERNAL");
  let fd;
  try {
    const parent = privateDirectorySnapshot(dirname(candidate), code);
    if (realpathSync(candidate) !== candidate) fail(code);
    const before = lstatSync(candidate);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || mode(before) !== "0600" || (CURRENT_UID !== null && before.uid !== CURRENT_UID)) fail(code);
    fd = openSync(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || mode(opened) !== "0600" || !sameIdentity(before, opened) || (CURRENT_UID !== null && opened.uid !== CURRENT_UID)) fail(code);
    const bytes = readFileSync(fd);
    afterReadHook({ path: candidate, fd, bytes });
    const finalFd = fstatSync(fd);
    const after = lstatSync(candidate);
    const parentAfter = privateDirectorySnapshot(dirname(candidate), code);
    if (!sameFileSnapshot(opened, finalFd) || !sameFileSnapshot(finalFd, after) || !sameIdentity(parent.info, parentAfter.info) || realpathSync(candidate) !== candidate) fail(code);
    return { value: JSON.parse(bytes), bytes, rawSha256: groupWebRoleUatSha256(bytes), identity: `${opened.dev}:${opened.ino}` };
  } catch (error) {
    if (error instanceof GroupWebRoleUatError) throw error;
    fail(code);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function writeExternalEvidence(outputPath, root, value, code = "GROUP_WEB_ROLE_UAT_OUTPUT_UNSAFE", afterWriteHook = () => {}) {
  const candidate = resolve(outputPath);
  const repo = resolve(root);
  if (candidate === repo || !relative(repo, candidate).startsWith("..")) fail("GROUP_WEB_ROLE_UAT_EVIDENCE_MUST_BE_EXTERNAL");
  const parent = privateDirectorySnapshot(dirname(candidate), code);
  let fd;
  let parentFd;
  try {
    parentFd = openSync(parent.path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    fd = openSync(candidate, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const created = fstatSync(fd);
    if (!created.isFile() || created.nlink !== 1 || (CURRENT_UID !== null && created.uid !== CURRENT_UID)) fail(code);
    const bytes = canonicalBytes(value);
    writeFileSync(fd, bytes);
    fchmodSync(fd, 0o600);
    fsyncSync(fd);
    afterWriteHook({ path: candidate, fd });
    const finalFd = fstatSync(fd);
    const finalPath = lstatSync(candidate);
    const parentAfter = privateDirectorySnapshot(parent.path, code);
    if (mode(finalFd) !== "0600" || !sameIdentity(created, finalFd) || !sameIdentity(finalFd, finalPath) || !sameIdentity(parent.info, parentAfter.info) || !sameIdentity(parent.info, fstatSync(parentFd))) fail(code);
    fsyncSync(parentFd);
    return { path: candidate, bytes: bytes.length, rawSha256: groupWebRoleUatSha256(bytes) };
  } catch (error) {
    if (error instanceof GroupWebRoleUatError) throw error;
    fail(error?.code === "EEXIST" ? "GROUP_WEB_ROLE_UAT_OUTPUT_EXISTS" : code);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (parentFd !== undefined) closeSync(parentFd);
  }
}

export function validateGroupWebRoleUatContract(contract, mapping, sourceAudit) {
  exactKeys(contract, ["formatVersion", "contractKind", "surface", "roles", "sourceInventoryHash", "legacyRuntimeSourceContractSha256", "collectorContractSha256", "collectorSourcePath", "collectorSourceRawSha256", "liveCaptureAuthorityPath", "liveCaptureAuthorityRawSha256", "runtimeRoleClasses", "requiredChecks", "items", "security", "humanAttestation", "productionImport"], "GROUP_WEB_ROLE_UAT_CONTRACT_INVALID");
  if (contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_legacy_group_web_role_uat" || contract.surface !== "legacy_group_web"
    || !exactArray(contract.roles, EXPECTED_ROLES) || !exactArray(contract.requiredChecks, EXPECTED_CHECKS)
    || !exactArray(contract.items?.map(item => item.legacyId), EXPECTED_IDS)
    || contract.sourceInventoryHash !== mapping?.sourceInventoryHash || contract.sourceInventoryHash !== sourceAudit?.sourceInventoryHash
    || contract.humanAttestation !== "HOLD" || contract.productionImport !== "HOLD") fail("GROUP_WEB_ROLE_UAT_CONTRACT_INVALID");
  if (contract.legacyRuntimeSourceContractSha256 !== "6dd615b2d8915db6aa56e7a87fbae8cba6a82cc0b3847d5183fbe367336d68af"
    || contract.collectorContractSha256 !== rawSha256("group-web-role-uat-authenticated-readonly-capture-v1")
    || contract.collectorSourcePath !== "scripts/hr-cutover/group-web-role-uat-readonly-collector.mjs"
    || contract.collectorSourceRawSha256 !== rawSha256(readFileSync(resolve(import.meta.dirname, "../..", contract.collectorSourcePath)))
    || contract.liveCaptureAuthorityPath !== "scripts/hr-cutover/contracts/group-web-role-uat-live-capture-authority-v1.json"
    || contract.liveCaptureAuthorityRawSha256 !== rawSha256(readFileSync(resolve(import.meta.dirname, "../..", contract.liveCaptureAuthorityPath)))
    || JSON.stringify(contract.runtimeRoleClasses) !== JSON.stringify({ employee: "group_web_employee", manager: "group_web_manager", web_admin: "group_web_web_admin" })) fail("GROUP_WEB_ROLE_UAT_CONTRACT_INVALID");
  exactKeys(contract.security, ["externalEvidenceOnly", "requiredDirectoryMode", "requiredFileMode", "forbiddenPayloads"], "GROUP_WEB_ROLE_UAT_CONTRACT_INVALID");
  if (contract.security.externalEvidenceOnly !== true || contract.security.requiredDirectoryMode !== "0700" || contract.security.requiredFileMode !== "0600"
    || !exactArray(contract.security.forbiddenPayloads, ["screenshot", "dom", "cookie", "credential", "personal_data"])) fail("GROUP_WEB_ROLE_UAT_CONTRACT_INVALID");
  const mappingById = new Map(mapping.items.map(item => [item.legacyId, item]));
  const auditById = new Map(sourceAudit.items.map(item => [item.legacyId, item]));
  for (const item of contract.items) {
    exactKeys(item, ["legacyId", "domain", "pageSlug", "legacyRouteSha256", "sourceAuditHash"], "GROUP_WEB_ROLE_UAT_CONTRACT_INVALID", String(item.legacyId));
    const mapped = mappingById.get(item.legacyId);
    const audited = auditById.get(item.legacyId);
    if (!mapped || !audited || mapped.domain !== item.domain || audited.domain !== item.domain || audited.entryResolved !== true || item.sourceAuditHash !== audited.fieldEvidenceHash
      || item.legacyRouteSha256 !== rawSha256(mapped.legacyUrl) || !/^[a-z0-9][a-z0-9-]+$/u.test(item.pageSlug) || !SHA256.test(item.sourceAuditHash)) fail("GROUP_WEB_ROLE_UAT_SOURCE_AUTHORITY_DRIFT", String(item.legacyId));
  }
  return contract;
}

function validateCaptureAuthorities({ contract, coverageByKey, runtimeCoverageRawSha256, deploymentEvidence, deploymentEvidenceRawSha256, authorizationEvidence, authorizationEvidenceRawSha256, runtimeTechnical, runtimeTechnicalRawSha256, collectorBundle, collectorBundleRawSha256 }) {
  const common = (artifact, kind) => artifact?.formatVersion === 1 && artifact.kind === kind && artifact.surface === "legacy_group_web" && artifact.captureMode === "authenticated_readonly" && artifact.sourceInventoryHash === contract.sourceInventoryHash && artifact.productionImport === "HOLD" && (observedTime(artifact.observedAt, "GROUP_WEB_ROLE_UAT_CAPTURE_OBSERVED_AT_INVALID"), true);
  exactKeys(deploymentEvidence, ["formatVersion", "kind", "surface", "captureMode", "observedAt", "sourceInventoryHash", "deploymentSourceManifestSha256", "routeManifestSha256", "productionImport"], "GROUP_WEB_ROLE_UAT_DEPLOYMENT_EVIDENCE_INVALID");
  exactKeys(authorizationEvidence, ["formatVersion", "kind", "surface", "captureMode", "observedAt", "sourceInventoryHash", "runtimeCoverageRawSha256", "cells", "productionImport"], "GROUP_WEB_ROLE_UAT_AUTHORIZATION_EVIDENCE_INVALID");
  exactKeys(runtimeTechnical, ["formatVersion", "kind", "surface", "captureMode", "observedAt", "sourceInventoryHash", "runtimeCoverageRawSha256", "deploymentEvidenceRawSha256", "authorizationEvidenceRawSha256", "cells", "productionImport"], "GROUP_WEB_ROLE_UAT_TECHNICAL_EVIDENCE_INVALID");
  if (!common(deploymentEvidence, "group_web_deployment_identity") || !SHA256.test(deploymentEvidence.deploymentSourceManifestSha256 ?? "") || !SHA256.test(deploymentEvidence.routeManifestSha256 ?? "")) fail("GROUP_WEB_ROLE_UAT_DEPLOYMENT_EVIDENCE_INVALID");
  if (!common(authorizationEvidence, "group_web_authorization_authority") || authorizationEvidence.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256 || authorizationEvidence.cells?.length !== 36) fail("GROUP_WEB_ROLE_UAT_AUTHORIZATION_EVIDENCE_INVALID");
  const authorizationByKey = new Map();
  for (const cell of authorizationEvidence.cells) {
    const key = `${cell.legacyId}:${cell.role}`, page = coverageByKey.get(key);
    exactKeys(cell, ["legacyId", "role", "decision", "menuDecision", "directRouteDecision", "fieldPolicySha256", "actionPolicySha256", "statePolicySha256", "runtimePageObservationSha256"], "GROUP_WEB_ROLE_UAT_AUTHORIZATION_EVIDENCE_INVALID", key);
    if (!page || cell.decision !== page.permissionEvidence.expected || cell.directRouteDecision !== page.permissionEvidence.observed || cell.runtimePageObservationSha256 !== page.observationSha256
      || cell.fieldPolicySha256 !== groupWebRoleUatSha256(page.fieldEvidence) || cell.actionPolicySha256 !== groupWebRoleUatSha256(page.actionEvidence) || cell.statePolicySha256 !== groupWebRoleUatSha256(page.stateEvidence)) fail("GROUP_WEB_ROLE_UAT_AUTHORIZATION_EVIDENCE_INVALID", key);
    authorizationByKey.set(key, cell);
  }
  if (authorizationByKey.size !== 36) fail("GROUP_WEB_ROLE_UAT_AUTHORIZATION_EVIDENCE_INVALID");
  if (!common(runtimeTechnical, "group_web_role_uat_runtime_technical") || runtimeTechnical.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256 || runtimeTechnical.deploymentEvidenceRawSha256 !== deploymentEvidenceRawSha256 || runtimeTechnical.authorizationEvidenceRawSha256 !== authorizationEvidenceRawSha256 || runtimeTechnical.cells?.length !== 36) fail("GROUP_WEB_ROLE_UAT_TECHNICAL_EVIDENCE_INVALID");
  const technicalByKey = new Map(), sessions = new Set();
  for (const cell of runtimeTechnical.cells) {
    const key = `${cell.legacyId}:${cell.role}`, authority = authorizationByKey.get(key);
    exactKeys(cell, ["legacyId", "role", "runtimePageObservationSha256", "menuDecision", "directRouteDecision", "auditObserved", "auditMetadataSha256", "sourceBeforeSha256", "sourceAfterSha256", "sessionIdentitySha256", "postLogoutSessionRejected", "clientStorageEmpty"], "GROUP_WEB_ROLE_UAT_TECHNICAL_EVIDENCE_INVALID", key);
    if (!authority || cell.runtimePageObservationSha256 !== authority.runtimePageObservationSha256 || cell.menuDecision !== authority.menuDecision || cell.directRouteDecision !== authority.directRouteDecision
      || cell.auditObserved !== true || !SHA256.test(cell.auditMetadataSha256 ?? "") || !SHA256.test(cell.sourceBeforeSha256 ?? "") || cell.sourceBeforeSha256 !== cell.sourceAfterSha256
      || !SHA256.test(cell.sessionIdentitySha256 ?? "") || sessions.has(cell.sessionIdentitySha256) || cell.postLogoutSessionRejected !== true || cell.clientStorageEmpty !== true) fail("GROUP_WEB_ROLE_UAT_TECHNICAL_EVIDENCE_INVALID", key);
    sessions.add(cell.sessionIdentitySha256); technicalByKey.set(key, cell);
  }
  if (technicalByKey.size !== 36 || sessions.size !== 36) fail("GROUP_WEB_ROLE_UAT_TECHNICAL_EVIDENCE_INVALID");
  exactKeys(collectorBundle, ["formatVersion", "kind", "status", "surface", "collectorContractSha256", "collectorSourceRawSha256", "liveCaptureAuthorityRawSha256", "liveCaptureAttestationRawSha256", "legacyRuntimeScoreEligibility", "runtimeCoverageRawSha256", "deploymentEvidenceRawSha256", "authorizationEvidenceRawSha256", "runtimeTechnicalRawSha256", "cells", "productionImport"], "GROUP_WEB_ROLE_UAT_COLLECTOR_BUNDLE_INVALID");
  if (collectorBundle.formatVersion !== 1 || collectorBundle.kind !== "group_web_role_uat_readonly_capture_bundle" || collectorBundle.status !== "CAPTURED_READ_ONLY" || collectorBundle.surface !== "legacy_group_web"
    || collectorBundle.collectorContractSha256 !== contract.collectorContractSha256 || collectorBundle.collectorSourceRawSha256 !== contract.collectorSourceRawSha256
    || collectorBundle.liveCaptureAuthorityRawSha256 !== contract.liveCaptureAuthorityRawSha256 || collectorBundle.liveCaptureAttestationRawSha256 !== null || collectorBundle.legacyRuntimeScoreEligibility !== "HOLD_NO_AUTHORIZED_ATTESTATION"
    || collectorBundle.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256 || collectorBundle.deploymentEvidenceRawSha256 !== deploymentEvidenceRawSha256 || collectorBundle.authorizationEvidenceRawSha256 !== authorizationEvidenceRawSha256
    || collectorBundle.runtimeTechnicalRawSha256 !== runtimeTechnicalRawSha256 || collectorBundle.cells !== 36 || collectorBundle.productionImport !== "HOLD" || !SHA256.test(collectorBundleRawSha256)) fail("GROUP_WEB_ROLE_UAT_COLLECTOR_BUNDLE_INVALID");
  return { authorizationByKey, technicalByKey };
}

function validateRuntimeCoverage(runtimeCoverage, contract) {
  let verified;
  try { verified = verifyLegacyRuntimePageEvidence(runtimeCoverage); }
  catch (error) { fail("GROUP_WEB_ROLE_UAT_RUNTIME_COVERAGE_INVALID", error?.code ?? "unknown"); }
  if (verified.surface !== "group_web" || verified.observations !== 36 || runtimeCoverage.sourceContractSha256 !== contract.legacyRuntimeSourceContractSha256) fail("GROUP_WEB_ROLE_UAT_RUNTIME_COVERAGE_INVALID");
  const expectedOrder = EXPECTED_IDS.flatMap(legacyId => EXPECTED_ROLES.map(role => `${legacyId}:${role}`));
  const itemById = new Map(contract.items.map(item => [item.legacyId, item]));
  const coverageByKey = new Map();
  for (const observation of runtimeCoverage.observations) {
    const role = EXPECTED_ROLES.find(candidate => contract.runtimeRoleClasses[candidate] === observation.roleClass);
    const item = itemById.get(observation.legacyId);
    const key = `${observation.legacyId}:${role}`;
    if (!role || !item || observation.stableId !== `group-web:${item.legacyId}:${observation.roleClass}:${item.pageSlug}:page`
      || observation.familyOrDomain !== item.pageSlug || observation.viewport !== "desktop" || observation.locatorSha256 !== item.legacyRouteSha256
      || observation.artifact.screenshotSha256 !== null || observation.artifact.bytes !== 0) fail("GROUP_WEB_ROLE_UAT_RUNTIME_COVERAGE_ADAPTER_INVALID", key);
    coverageByKey.set(key, observation);
  }
  if (!exactArray([...coverageByKey.keys()], expectedOrder)) fail("GROUP_WEB_ROLE_UAT_RUNTIME_COVERAGE_ADAPTER_INVALID");
  return coverageByKey;
}

function validateGrantSnapshot(snapshot, contract, runtimeCoverageRawSha256, coverageByKey, authorities, provenanceHashes) {
  assertNoSensitiveKeys(snapshot);
  exactKeys(snapshot, ["formatVersion", "evidenceKind", "surface", "captureMode", "sourceInventoryHash", "runtimeCoverageRawSha256", "captureProvenance", "observedAt", "roles", "productionImport"], "GROUP_WEB_ROLE_UAT_GRANT_SNAPSHOT_INVALID");
  if (snapshot.formatVersion !== 1 || snapshot.evidenceKind !== "group_web_role_grant_snapshot" || snapshot.surface !== "legacy_group_web"
    || snapshot.captureMode !== "authenticated_readonly" || snapshot.sourceInventoryHash !== contract.sourceInventoryHash || snapshot.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256
    || snapshot.productionImport !== "HOLD" || !exactArray(snapshot.roles?.map(row => row.role), EXPECTED_ROLES)) fail("GROUP_WEB_ROLE_UAT_GRANT_SNAPSHOT_INVALID");
  observedTime(snapshot.observedAt, "GROUP_WEB_ROLE_UAT_GRANT_SNAPSHOT_INVALID");
  exactKeys(snapshot.captureProvenance, ["collectorContractSha256", "collectorSourceRawSha256", "collectorBundleRawSha256", "runtimeCoverageRawSha256", "deploymentEvidenceRawSha256", "authorizationEvidenceRawSha256", "runtimeTechnicalRawSha256"], "GROUP_WEB_ROLE_UAT_CAPTURE_PROVENANCE_INVALID");
  if (snapshot.captureProvenance.collectorContractSha256 !== contract.collectorContractSha256 || snapshot.captureProvenance.runtimeCoverageRawSha256 !== runtimeCoverageRawSha256
    || snapshot.captureProvenance.collectorSourceRawSha256 !== contract.collectorSourceRawSha256 || snapshot.captureProvenance.collectorBundleRawSha256 !== provenanceHashes.collectorBundleRawSha256
    || snapshot.captureProvenance.deploymentEvidenceRawSha256 !== provenanceHashes.deploymentEvidenceRawSha256 || snapshot.captureProvenance.authorizationEvidenceRawSha256 !== provenanceHashes.authorizationEvidenceRawSha256
    || snapshot.captureProvenance.runtimeTechnicalRawSha256 !== provenanceHashes.runtimeTechnicalRawSha256) fail("GROUP_WEB_ROLE_UAT_CAPTURE_PROVENANCE_INVALID");
  const cells = new Map();
  const subjectHashes = new Set();
  const contextHashes = new Set();
  const sessionHashes = new Set();
  for (const roleRow of snapshot.roles) {
    exactKeys(roleRow, ["role", "subjectIdentitySha256", "authorizationContextSha256", "grants"], "GROUP_WEB_ROLE_UAT_GRANT_SNAPSHOT_INVALID", roleRow.role);
    if (![roleRow.subjectIdentitySha256, roleRow.authorizationContextSha256].every(value => SHA256.test(value ?? ""))
      || subjectHashes.has(roleRow.subjectIdentitySha256) || contextHashes.has(roleRow.authorizationContextSha256)
      || !exactArray(roleRow.grants?.map(row => row.legacyId), EXPECTED_IDS)) fail("GROUP_WEB_ROLE_UAT_GRANT_IDENTITY_REUSE", roleRow.role);
    subjectHashes.add(roleRow.subjectIdentitySha256); contextHashes.add(roleRow.authorizationContextSha256);
    for (const grant of roleRow.grants) {
      exactKeys(grant, ["legacyId", "decision", "menuDecision", "directRouteDecision", "fieldPolicySha256", "actionPolicySha256", "statePolicySha256", "runtimePageObservationSha256", "sessionIdentitySha256"], "GROUP_WEB_ROLE_UAT_GRANT_CELL_INVALID", `${grant.legacyId}:${roleRow.role}`);
      const coverage = coverageByKey.get(`${grant.legacyId}:${roleRow.role}`);
      const authority = authorities.authorizationByKey.get(`${grant.legacyId}:${roleRow.role}`), technical = authorities.technicalByKey.get(`${grant.legacyId}:${roleRow.role}`);
      if (!["allow", "deny"].includes(grant.decision) || !["visible", "hidden"].includes(grant.menuDecision) || !["allow", "deny"].includes(grant.directRouteDecision)
        || JSON.stringify({ legacyId: grant.legacyId, role: roleRow.role, decision: grant.decision, menuDecision: grant.menuDecision, directRouteDecision: grant.directRouteDecision, fieldPolicySha256: grant.fieldPolicySha256, actionPolicySha256: grant.actionPolicySha256, statePolicySha256: grant.statePolicySha256, runtimePageObservationSha256: grant.runtimePageObservationSha256 }) !== JSON.stringify(authority)
        || grant.sessionIdentitySha256 !== technical?.sessionIdentitySha256 || grant.decision !== coverage?.permissionEvidence.expected || grant.directRouteDecision !== coverage?.permissionEvidence.observed
        || grant.runtimePageObservationSha256 !== coverage?.observationSha256
        || grant.fieldPolicySha256 !== groupWebRoleUatSha256(coverage?.fieldEvidence) || grant.actionPolicySha256 !== groupWebRoleUatSha256(coverage?.actionEvidence) || grant.statePolicySha256 !== groupWebRoleUatSha256(coverage?.stateEvidence)
        || !SHA256.test(grant.sessionIdentitySha256 ?? "") || sessionHashes.has(grant.sessionIdentitySha256)) fail("GROUP_WEB_ROLE_UAT_GRANT_CELL_INVALID", `${grant.legacyId}:${roleRow.role}`);
      sessionHashes.add(grant.sessionIdentitySha256);
      cells.set(`${grant.legacyId}:${roleRow.role}`, { ...grant, role: roleRow.role, subjectIdentitySha256: roleRow.subjectIdentitySha256, authorizationContextSha256: roleRow.authorizationContextSha256 });
    }
  }
  for (const legacyId of EXPECTED_IDS) {
    const decisions = EXPECTED_ROLES.map(role => cells.get(`${legacyId}:${role}`)?.decision);
    if (!decisions.includes("allow") || !decisions.includes("deny")) fail("GROUP_WEB_ROLE_UAT_ALLOW_DENY_PAIR_MISSING", String(legacyId));
  }
  if (sessionHashes.size !== 36) fail("GROUP_WEB_ROLE_UAT_SESSION_LIFECYCLE_INVALID");
  return cells;
}

function validateObservations(observations, contract, grantCells, grantRawSha256, grantObservedAt, technicalByKey) {
  assertNoSensitiveKeys(observations);
  exactKeys(observations, ["formatVersion", "evidenceKind", "surface", "captureMode", "sourceInventoryHash", "grantSnapshotRawSha256", "observedAt", "cells", "humanAttestation", "productionImport"], "GROUP_WEB_ROLE_UAT_OBSERVATIONS_INVALID");
  if (observations.formatVersion !== 1 || observations.evidenceKind !== "group_web_role_uat_observations" || observations.surface !== "legacy_group_web"
    || observations.captureMode !== "authenticated_readonly" || observations.sourceInventoryHash !== contract.sourceInventoryHash || observations.grantSnapshotRawSha256 !== grantRawSha256
    || observations.humanAttestation !== "HOLD" || observations.productionImport !== "HOLD" || observations.cells?.length !== 36) fail("GROUP_WEB_ROLE_UAT_OBSERVATIONS_INVALID");
  const observationsObservedAt = observedTime(observations.observedAt, "GROUP_WEB_ROLE_UAT_OBSERVATIONS_INVALID");
  const grantObservedTime = Date.parse(grantObservedAt);
  if (observationsObservedAt < grantObservedTime || observationsObservedAt - grantObservedTime > 24 * 60 * 60 * 1000) fail("GROUP_WEB_ROLE_UAT_OBSERVED_AT_SEQUENCE_INVALID");
  const expectedOrder = EXPECTED_IDS.flatMap(legacyId => EXPECTED_ROLES.map(role => `${legacyId}:${role}`));
  if (!exactArray(observations.cells.map(cell => `${cell.legacyId}:${cell.role}`), expectedOrder)) fail("GROUP_WEB_ROLE_UAT_CELL_SET_INVALID");
  const cellEvidence = [];
  const observationHashes = new Set();
  for (const cell of observations.cells) {
    const key = `${cell.legacyId}:${cell.role}`;
    const grant = grantCells.get(key);
    const technical = technicalByKey.get(key);
    exactKeys(cell, ["legacyId", "role", "decision", "grantCellSha256", "subjectIdentitySha256", "authorizationContextSha256", "sessionIdentitySha256", "checks"], "GROUP_WEB_ROLE_UAT_CELL_INVALID", key);
    const grantPayload = { legacyId: grant.legacyId, role: grant.role, decision: grant.decision, menuDecision: grant.menuDecision, directRouteDecision: grant.directRouteDecision, fieldPolicySha256: grant.fieldPolicySha256, actionPolicySha256: grant.actionPolicySha256, statePolicySha256: grant.statePolicySha256, runtimePageObservationSha256: grant.runtimePageObservationSha256, sessionIdentitySha256: grant.sessionIdentitySha256, subjectIdentitySha256: grant.subjectIdentitySha256, authorizationContextSha256: grant.authorizationContextSha256 };
    if (cell.decision !== grant.decision || cell.grantCellSha256 !== groupWebRoleUatSha256(grantPayload)
      || cell.subjectIdentitySha256 !== grant.subjectIdentitySha256 || cell.authorizationContextSha256 !== grant.authorizationContextSha256 || cell.sessionIdentitySha256 !== grant.sessionIdentitySha256) fail("GROUP_WEB_ROLE_UAT_GRANT_OBSERVATION_DRIFT", key);
    exactKeys(cell.checks, EXPECTED_CHECKS, "GROUP_WEB_ROLE_UAT_CHECK_SET_INVALID", key);
    const menu = cell.checks.menu;
    exactKeys(menu, ["status", "expectedDecision", "observedDecision", "runtimePageObservationSha256", "observationSha256"], "GROUP_WEB_ROLE_UAT_CHECK_INVALID", `${key}:menu`);
    if (menu.status !== "PASS" || menu.expectedDecision !== grant.menuDecision || menu.observedDecision !== technical.menuDecision || menu.runtimePageObservationSha256 !== technical.runtimePageObservationSha256 || !SHA256.test(menu.observationSha256 ?? "")) fail("GROUP_WEB_ROLE_UAT_MENU_OBSERVATION_DRIFT", key);
    const policyChecks = [["field", grant.fieldPolicySha256], ["action", grant.actionPolicySha256], ["state", grant.statePolicySha256]];
    for (const [checkName, policySha256] of policyChecks) {
      const check = cell.checks[checkName];
      exactKeys(check, ["status", "policySha256", "observationSha256"], "GROUP_WEB_ROLE_UAT_CHECK_INVALID", `${key}:${checkName}`);
      if (check.status !== "PASS" || check.policySha256 !== policySha256 || !SHA256.test(check.observationSha256 ?? "")) fail("GROUP_WEB_ROLE_UAT_CHECK_INVALID", `${key}:${checkName}`);
    }
    const directRoute = cell.checks.direct_route;
    exactKeys(directRoute, ["status", "expectedDecision", "observedDecision", "observationSha256"], "GROUP_WEB_ROLE_UAT_CHECK_INVALID", `${key}:direct_route`);
    if (directRoute.status !== "PASS" || grant.decision !== grant.directRouteDecision || directRoute.expectedDecision !== grant.directRouteDecision
      || directRoute.observedDecision !== technical.directRouteDecision || !SHA256.test(directRoute.observationSha256 ?? "")) fail("GROUP_WEB_ROLE_UAT_DIRECT_ROUTE_BYPASS", key);
    const audit = cell.checks.audit;
    exactKeys(audit, ["status", "auditObserved", "auditMetadataSha256", "observationSha256"], "GROUP_WEB_ROLE_UAT_CHECK_INVALID", `${key}:audit`);
    if (audit.status !== "PASS" || audit.auditObserved !== technical.auditObserved || audit.auditMetadataSha256 !== technical.auditMetadataSha256 || !SHA256.test(audit.observationSha256 ?? "")) fail("GROUP_WEB_ROLE_UAT_CHECK_INVALID", `${key}:audit`);
    const noWrite = cell.checks.no_write;
    exactKeys(noWrite, ["status", "beforeSha256", "afterSha256", "observationSha256"], "GROUP_WEB_ROLE_UAT_CHECK_INVALID", `${key}:no_write`);
    if (noWrite.status !== "PASS" || noWrite.beforeSha256 !== technical.sourceBeforeSha256 || noWrite.afterSha256 !== technical.sourceAfterSha256 || noWrite.beforeSha256 !== noWrite.afterSha256 || !SHA256.test(noWrite.observationSha256 ?? "")) fail("GROUP_WEB_ROLE_UAT_WRITE_DETECTED", key);
    const logout = cell.checks.logout_cleanup;
    exactKeys(logout, ["status", "sessionIdentitySha256", "postLogoutSessionRejected", "clientStorageEmpty", "observationSha256"], "GROUP_WEB_ROLE_UAT_CHECK_INVALID", `${key}:logout_cleanup`);
    if (logout.status !== "PASS" || logout.sessionIdentitySha256 !== technical.sessionIdentitySha256 || logout.postLogoutSessionRejected !== technical.postLogoutSessionRejected || logout.clientStorageEmpty !== technical.clientStorageEmpty || !SHA256.test(logout.observationSha256 ?? "")) fail("GROUP_WEB_ROLE_UAT_LOGOUT_CLEANUP_FAILED", key);
    for (const checkName of EXPECTED_CHECKS) {
      const evidenceHash = cell.checks[checkName].observationSha256;
      const semanticEvidence = Object.fromEntries(Object.entries(cell.checks[checkName]).filter(([name]) => name !== "observationSha256"));
      if (evidenceHash !== groupWebRoleUatSha256({ key, checkName, semanticEvidence })) fail("GROUP_WEB_ROLE_UAT_OBSERVATION_HASH_INVALID", `${key}:${checkName}`);
      if (observationHashes.has(evidenceHash)) fail("GROUP_WEB_ROLE_UAT_OBSERVATION_REUSE", `${key}:${checkName}`);
      observationHashes.add(evidenceHash);
    }
    cellEvidence.push({ legacyId: cell.legacyId, role: cell.role, decision: cell.decision, cellSha256: groupWebRoleUatSha256(cell) });
  }
  return cellEvidence;
}

export function assessGroupWebRoleUat({ contract, mapping, sourceAudit, runtimeCoverage, runtimeCoverageRawSha256, deploymentEvidence, deploymentEvidenceRawSha256, authorizationEvidence, authorizationEvidenceRawSha256, runtimeTechnical, runtimeTechnicalRawSha256, collectorBundle, collectorBundleRawSha256, grantSnapshot, grantSnapshotRawSha256, observations, observationsRawSha256 }) {
  validateGroupWebRoleUatContract(contract, mapping, sourceAudit);
  const coverageByKey = validateRuntimeCoverage(runtimeCoverage, contract);
  const authorities = validateCaptureAuthorities({ contract, coverageByKey, runtimeCoverageRawSha256, deploymentEvidence, deploymentEvidenceRawSha256, authorizationEvidence, authorizationEvidenceRawSha256, runtimeTechnical, runtimeTechnicalRawSha256, collectorBundle, collectorBundleRawSha256 });
  const provenanceHashes = { deploymentEvidenceRawSha256, authorizationEvidenceRawSha256, runtimeTechnicalRawSha256, collectorBundleRawSha256 };
  const grantCells = validateGrantSnapshot(grantSnapshot, contract, runtimeCoverageRawSha256, coverageByKey, authorities, provenanceHashes);
  const cellEvidence = validateObservations(observations, contract, grantCells, grantSnapshotRawSha256, grantSnapshot.observedAt, authorities.technicalByKey);
  return {
    formatVersion: 1,
    resultKind: "group_web_role_uat_machine_result",
    status: "PASS",
    surface: "legacy_group_web",
    sourceInventoryHash: contract.sourceInventoryHash,
    contractSha256: groupWebRoleUatSha256(contract),
    runtimeCoverageRawSha256,
    collectorBundleRawSha256,
    liveCaptureAuthorityRawSha256: contract.liveCaptureAuthorityRawSha256,
    liveCaptureAttestationRawSha256: collectorBundle.liveCaptureAttestationRawSha256,
    legacyRuntimeScoreEligibility: collectorBundle.legacyRuntimeScoreEligibility,
    grantSnapshotRawSha256,
    observationsRawSha256,
    observedAt: observations.observedAt,
    roles: [...EXPECTED_ROLES],
    legacyIds: [...EXPECTED_IDS],
    cells: cellEvidence,
    summary: { entries: 12, roles: 3, cells: 36, sessions: 36, allowDenyPairs: 12, checksPerCell: 8, passedChecks: 288 },
    evidencePolicy: { externalOnly: true, directoryMode: "0700", fileMode: "0600", payload: "hash_and_metadata_only" },
    clientEvidenceSubstitution: "FORBIDDEN",
    humanAttestation: "HOLD",
    productionImport: "HOLD"
  };
}

export const GROUP_WEB_ROLE_UAT_IDS = EXPECTED_IDS;
export const GROUP_WEB_ROLE_UAT_ROLES = EXPECTED_ROLES;
export const GROUP_WEB_ROLE_UAT_CHECKS = EXPECTED_CHECKS;
