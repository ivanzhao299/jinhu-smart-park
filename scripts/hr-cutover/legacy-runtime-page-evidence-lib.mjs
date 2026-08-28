import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

export class LegacyRuntimePageEvidenceError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyRuntimePageEvidenceError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyRuntimePageEvidenceError(code, detail); };
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{2,79}$/u;
const SLUG = /^[a-z0-9][a-z0-9_-]{0,79}$/u;
const CLIENT_PAGE_ID = /^client:([a-z0-9][a-z0-9_-]*):([a-z0-9][a-z0-9_-]*):page$/u;
const GROUP_WEB_PAGE_ID = /^group-web:([1-9][0-9]*):([a-z0-9][a-z0-9_-]*):([a-z0-9][a-z0-9_-]*):page$/u;
const PRECONDITION = /^[A-Z][A-Z0-9_]{1,63}$/u;
export const LEGACY_RUNTIME_PAGE_SOURCE_CONTRACT_SHA256 = Object.freeze({
  client: "a63c4d0460c7e208e5525572f9fbcb06a277cb4a3d0df2e507b73aa356d1ba0d",
  group_web: "6dd615b2d8915db6aa56e7a87fbae8cba6a82cc0b3847d5183fbe367336d68af"
});

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  return value;
};
const valueHash = value => createHash("sha256").update(`${JSON.stringify(stableValue(value))}\n`).digest("hex");

const exactKeys = (value, keys, label) => {
  if (!isObject(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail("LEGACY_RUNTIME_PAGE_EVIDENCE_SHAPE_INVALID", label);
  }
};
const oneOf = (value, values, label) => {
  if (!values.includes(value)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_VALUE_INVALID", label);
};
const boolean = (value, label) => {
  if (typeof value !== "boolean") fail("LEGACY_RUNTIME_PAGE_EVIDENCE_VALUE_INVALID", label);
};
const sha256 = (value, label) => {
  if (typeof value !== "string" || !SHA256.test(value)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_HASH_INVALID", label);
};

const decodeEntities = value => value.replace(/&#(?:x([0-9a-f]+)|(\d+));?/giu, (_match, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)));
const decodedVariants = input => {
  const values = new Set([input]);
  let frontier = [input];
  for (let depth = 0; depth < 3; depth += 1) {
    const next = [];
    for (const current of frontier) {
      const candidates = [decodeEntities(current)];
      try { candidates.push(decodeURIComponent(current)); } catch { /* raw value remains scanned */ }
      if (/^[A-Za-z0-9+/_-]+={0,2}$/u.test(current) && current.length >= 16) {
        try { candidates.push(Buffer.from(current, current.includes("-") || current.includes("_") ? "base64url" : "base64").toString("utf8")); } catch { /* invalid encoding */ }
      }
      if (/^[0-9a-f]+$/iu.test(current) && current.length >= 24 && current.length % 2 === 0) candidates.push(Buffer.from(current, "hex").toString("utf8"));
      for (const candidate of candidates) if (typeof candidate === "string" && !values.has(candidate)) { values.add(candidate); next.push(candidate); }
    }
    frontier = next;
  }
  return [...values];
};
const privateIpv4 = value => (value.match(/(?:^|[^0-9])((?:\d{1,3}\.){3}\d{1,3})(?=$|[^0-9])/gu) ?? []).some(candidate => {
  const octets = (candidate.match(/\d{1,3}/gu) ?? []).map(Number);
  return octets.length === 4 && octets.every(octet => octet <= 255) && (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
});
const sensitivePattern = /(?:\/Users\/|Downloads\/|file:\/\/|[A-Za-z]:[\\/]|(?:postgres(?:ql)?|sqlserver):\/\/|(?:pass(?:word)?|passwd|pwd|token|secret)\s*[=:]|Bearer\s+[A-Za-z0-9._-]+|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/iu;
const personalPattern = /(?:^|[^0-9])1[3-9]\d{9}(?:[^0-9]|$)|(?:^|[^0-9])\d{17}[0-9Xx](?:[^0-9A-Za-z]|$)/u;
const assertNoSensitiveContent = value => {
  const visit = candidate => {
    if (typeof candidate === "string") {
      for (const variant of decodedVariants(candidate)) {
        if (sensitivePattern.test(variant) || privateIpv4(variant) || personalPattern.test(variant)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_SENSITIVE_CONTENT", "redacted hash-only evidence required");
      }
    } else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (isObject(candidate)) Object.values(candidate).forEach(visit);
  };
  visit(value);
};

export const legacyRuntimePageArtifactDescriptorHash = artifact => valueHash({
  screenshotSha256: artifact.screenshotSha256,
  bytes: artifact.bytes,
  externalMode: artifact.externalMode
});
export const legacyRuntimePageObservationHash = observation => valueHash(Object.fromEntries(Object.entries(observation).filter(([key]) => key !== "observationSha256")));

const uniqueStableIds = (items, label) => {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.stableId)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_DUPLICATE", `${label}.stableId`);
    ids.add(item.stableId);
  }
};

const verifyField = (item, pageId, index) => {
  const label = `${pageId}.fieldEvidence.${index}`;
  exactKeys(item, ["stableId", "labelSha256", "controlType", "required", "defaultKind", "masked"], label);
  const prefix = `${pageId}:field:`;
  if (typeof item.stableId !== "string" || !item.stableId.startsWith(prefix) || !SLUG.test(item.stableId.slice(prefix.length))) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_STABLE_ID_INVALID", label);
  sha256(item.labelSha256, `${label}.labelSha256`);
  oneOf(item.controlType, ["text", "select", "date", "grid", "tree", "file", "other"], `${label}.controlType`);
  oneOf(item.required, ["yes", "no", "unproven"], `${label}.required`);
  oneOf(item.defaultKind, ["empty", "generated", "inherited", "unproven"], `${label}.defaultKind`);
  boolean(item.masked, `${label}.masked`);
};
const verifyAction = (item, pageId, index) => {
  const label = `${pageId}.actionEvidence.${index}`;
  exactKeys(item, ["stableId", "visible", "enabled", "executed", "preconditionCode"], label);
  if (typeof item.stableId !== "string" || !item.stableId.startsWith(`${pageId}:action:`) || !SLUG.test(item.stableId.slice(`${pageId}:action:`.length))) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_STABLE_ID_INVALID", label);
  boolean(item.visible, `${label}.visible`); boolean(item.enabled, `${label}.enabled`);
  if (item.executed !== false) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_ACTION_EXECUTED", item.stableId);
  if (typeof item.preconditionCode !== "string" || !PRECONDITION.test(item.preconditionCode)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_VALUE_INVALID", `${label}.preconditionCode`);
};
const verifyState = (item, pageId, index) => {
  const label = `${pageId}.stateEvidence.${index}`;
  exactKeys(item, ["stableId", "fromCodeSha256", "toCodeSha256", "source", "executed"], label);
  const prefix = `${pageId}:transition:`;
  if (typeof item.stableId !== "string" || !item.stableId.startsWith(prefix) || item.stableId.slice(prefix.length).split(":").length !== 2 || item.stableId.slice(prefix.length).split(":").some(part => !SLUG.test(part))) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_STABLE_ID_INVALID", label);
  sha256(item.fromCodeSha256, `${label}.fromCodeSha256`); sha256(item.toCodeSha256, `${label}.toCodeSha256`);
  oneOf(item.source, ["page_declared", "source_corroborated", "unproven"], `${label}.source`);
  if (item.executed !== false) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_STATE_EXECUTED", item.stableId);
};

const verifyObservation = (item, surface, index) => {
  const label = `observations.${index}`;
  exactKeys(item, ["stableId", "familyOrDomain", "legacyId", "roleClass", "viewport", "locatorSha256", "pageStructureSha256", "fieldEvidence", "actionEvidence", "stateEvidence", "permissionEvidence", "artifact", "observationSha256"], label);
  if (typeof item.familyOrDomain !== "string" || !SLUG.test(item.familyOrDomain) || typeof item.roleClass !== "string" || !SLUG.test(item.roleClass)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_STABLE_ID_INVALID", label);
  const clientMatch = typeof item.stableId === "string" ? item.stableId.match(CLIENT_PAGE_ID) : null;
  const groupMatch = typeof item.stableId === "string" ? item.stableId.match(GROUP_WEB_PAGE_ID) : null;
  if (surface === "client") {
    if (!clientMatch || item.legacyId !== null || !item.roleClass.startsWith("client_") || clientMatch[1] !== item.familyOrDomain) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_SURFACE_INVALID", label);
  } else if (!groupMatch || !Number.isInteger(item.legacyId) || item.legacyId < 1 || Number(groupMatch[1]) !== item.legacyId || groupMatch[2] !== item.roleClass || groupMatch[3] !== item.familyOrDomain || !item.roleClass.startsWith("group_web_")) {
    fail("LEGACY_RUNTIME_PAGE_EVIDENCE_SURFACE_INVALID", label);
  }
  oneOf(item.viewport, ["desktop", "phone_390"], `${label}.viewport`);
  sha256(item.locatorSha256, `${label}.locatorSha256`); sha256(item.pageStructureSha256, `${label}.pageStructureSha256`); sha256(item.observationSha256, `${label}.observationSha256`);
  if (!Array.isArray(item.fieldEvidence) || !Array.isArray(item.actionEvidence) || !Array.isArray(item.stateEvidence)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_SHAPE_INVALID", label);
  if (item.fieldEvidence.length + item.actionEvidence.length === 0) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_ATOMIC_EVIDENCE_REQUIRED", label);
  item.fieldEvidence.forEach((entry, entryIndex) => verifyField(entry, item.stableId, entryIndex));
  item.actionEvidence.forEach((entry, entryIndex) => verifyAction(entry, item.stableId, entryIndex));
  item.stateEvidence.forEach((entry, entryIndex) => verifyState(entry, item.stableId, entryIndex));
  uniqueStableIds([...item.fieldEvidence, ...item.actionEvidence, ...item.stateEvidence], label);
  exactKeys(item.permissionEvidence, ["expected", "observed", "dataScope", "directRouteChecked"], `${label}.permissionEvidence`);
  oneOf(item.permissionEvidence.expected, ["allow", "deny"], `${label}.permissionEvidence.expected`);
  oneOf(item.permissionEvidence.observed, ["allow", "deny"], `${label}.permissionEvidence.observed`);
  oneOf(item.permissionEvidence.dataScope, ["self", "team", "park", "admin", "none"], `${label}.permissionEvidence.dataScope`);
  boolean(item.permissionEvidence.directRouteChecked, `${label}.permissionEvidence.directRouteChecked`);
  if (item.permissionEvidence.directRouteChecked !== true) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_PERMISSION_UNVERIFIED", label);
  exactKeys(item.artifact, ["descriptorSha256", "screenshotSha256", "bytes", "externalMode"], `${label}.artifact`);
  sha256(item.artifact.descriptorSha256, `${label}.artifact.descriptorSha256`);
  if (item.artifact.screenshotSha256 !== null) sha256(item.artifact.screenshotSha256, `${label}.artifact.screenshotSha256`);
  if (!Number.isInteger(item.artifact.bytes) || item.artifact.bytes < 0 || item.artifact.externalMode !== "0600" || (item.artifact.screenshotSha256 === null) !== (item.artifact.bytes === 0)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_ARTIFACT_INVALID", label);
  if (item.artifact.descriptorSha256 !== legacyRuntimePageArtifactDescriptorHash(item.artifact)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_ARTIFACT_INVALID", `${label}.descriptorSha256`);
  if (item.observationSha256 !== legacyRuntimePageObservationHash(item)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_HASH_INVALID", `${label}.observationSha256`);
};

export function verifyLegacyRuntimePageEvidence(manifest) {
  exactKeys(manifest, ["formatVersion", "contractKind", "surface", "batchId", "operationMode", "sourceContractSha256", "observations", "sensitiveScan", "humanSignoff", "productionImport"], "manifest");
  assertNoSensitiveContent(manifest);
  if (manifest.formatVersion !== 1 || manifest.contractKind !== "yuzhou_hr_legacy_runtime_page_evidence") fail("LEGACY_RUNTIME_PAGE_EVIDENCE_IDENTITY_INVALID", "formatVersion or contractKind");
  oneOf(manifest.surface, ["client", "group_web"], "surface");
  if (typeof manifest.batchId !== "string" || !SAFE_ID.test(manifest.batchId)) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_IDENTITY_INVALID", "batchId");
  if (manifest.operationMode !== "read_only") fail("LEGACY_RUNTIME_PAGE_EVIDENCE_READ_ONLY_REQUIRED", "operationMode");
  sha256(manifest.sourceContractSha256, "sourceContractSha256");
  if (manifest.sourceContractSha256 !== LEGACY_RUNTIME_PAGE_SOURCE_CONTRACT_SHA256[manifest.surface]) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_SOURCE_CONTRACT_INVALID", manifest.surface);
  if (manifest.sensitiveScan !== "PASS") fail("LEGACY_RUNTIME_PAGE_EVIDENCE_SENSITIVE_SCAN_REQUIRED", "sensitiveScan");
  if (manifest.humanSignoff !== "HOLD" || manifest.productionImport !== "HOLD") fail("LEGACY_RUNTIME_PAGE_EVIDENCE_HOLD_REQUIRED", "humanSignoff and productionImport");
  if (!Array.isArray(manifest.observations) || manifest.observations.length === 0) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_SHAPE_INVALID", "observations");
  manifest.observations.forEach((item, index) => verifyObservation(item, manifest.surface, index));
  const cellIds = manifest.observations.map(item => `${item.stableId}|${item.roleClass}|${item.viewport}`);
  if (new Set(cellIds).size !== cellIds.length) fail("LEGACY_RUNTIME_PAGE_EVIDENCE_DUPLICATE", "observation cell");
  return {
    status: "PASS",
    surface: manifest.surface,
    observations: manifest.observations.length,
    fields: manifest.observations.reduce((sum, item) => sum + item.fieldEvidence.length, 0),
    actions: manifest.observations.reduce((sum, item) => sum + item.actionEvidence.length, 0),
    states: manifest.observations.reduce((sum, item) => sum + item.stateEvidence.length, 0),
    humanSignoff: "HOLD",
    productionImport: "HOLD"
  };
}
