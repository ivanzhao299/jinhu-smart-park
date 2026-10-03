/**
 * Private, deterministic planning only.  This module has no filesystem, network,
 * database, CLI, or writer dependency; a returned plan is deliberately HOLD.
 */
import { createHash } from "node:crypto";

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAPPINGS = Object.freeze([
  Object.freeze({ sourceField: "oldaddr", targetField: "nativePlace", targetColumn: "native_place", sourceMaxLength: 50, maxLength: 128 }),
  Object.freeze({ sourceField: "edulevel", targetField: "degree", targetColumn: "degree", sourceMaxLength: 24, maxLength: 64 }),
]);
const CONTRACT_KEYS = ["formatVersion", "contractKind", "sourceSystem", "productionImport", "authorizationGranted", "executionReachable", "identityResolution", "mappings", "sourceEvidence", "mutationPolicy", "writer"];
const SOURCE_EVIDENCE = Object.freeze({ status: "HASH_BOUND_PROCEDURE_METADATA_AND_COLUMN_TYPES_VERIFIED", catalogSha256: "8e62d0308c14db70192f5b94f8cc775f2e87032d14f5cbeaee238d1d177f5014", procedures: Object.freeze({ u_personinfo2003: "adf140a230a553b28eca6558dcd324e7ac84fa58f821be23dab75af59437017a", web_personinfo_SelectCommand: "4785a80d7bdc5496c7d64d06567f3a51e3c4fd6aef1f7add7b43d3fc65410868" }), custody: "metadata_only_not_live_source_custody" });

export class LegacyPersonnelAliasBackfillPlanError extends Error {
  constructor(code) { super(code); this.name = "LegacyPersonnelAliasBackfillPlanError"; this.code = code; }
}
const fail = code => { throw new LegacyPersonnelAliasBackfillPlanError(`PERSONNEL_ALIAS_PLAN_${code}`); };
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = value => Object.keys(value).sort().join("|");
const exact = (value, expected, code) => { if (!plain(value) || keys(value) !== [...expected].sort().join("|")) fail(code); };
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (plain(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
export const legacyPersonnelAliasPlanSha256 = value => createHash("sha256").update(stable(value)).digest("hex");
const digest = (tag, value) => legacyPersonnelAliasPlanSha256({ tag, value });
const validHash = value => typeof value === "string" && SHA256.test(value);
const wellFormedText = value => {
  if (typeof value !== "string" || value.includes("\0")) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index++;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
};
const validScopeId = value => wellFormedText(value) && value.length > 0 && value.length <= 128 && value.trim() === value;
const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export function validateLegacyPersonnelAliasBackfillContract(contract) {
  exact(contract, CONTRACT_KEYS, "CONTRACT_INVALID");
  if (contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_legacy_personnel_alias_fill_only_backfill"
    || contract.sourceSystem !== "yuzhou-v10" || contract.productionImport !== "HOLD"
    || contract.authorizationGranted !== false || contract.executionReachable !== false
    || contract.identityResolution !== "stable_profile_employee_source_identity_exact"
    || stable(contract.sourceEvidence) !== stable(SOURCE_EVIDENCE)
    || contract.mutationPolicy !== "private_fill_null_only_preserve_every_non_null_value" || contract.writer !== "absent"
    || stable(contract.mappings) !== stable(MAPPINGS)) fail("CONTRACT_INVALID");
  return deepFreeze(structuredClone(contract));
}

function validateInput(input) {
  exact(input, ["contract", "binding", "employees", "profiles", "sourceRecords"], "INPUT_INVALID");
  const contract = validateLegacyPersonnelAliasBackfillContract(input.contract);
  exact(input.binding, ["codeSha256", "sourceEvidenceSha256", "sourceSnapshotSha256", "targetScope"], "BINDING_INVALID");
  if (![input.binding.codeSha256, input.binding.sourceEvidenceSha256, input.binding.sourceSnapshotSha256].every(validHash)) fail("BINDING_INVALID");
  exact(input.binding.targetScope, ["tenantId", "parkId"], "SCOPE_INVALID");
  if (![input.binding.targetScope.tenantId, input.binding.targetScope.parkId].every(validScopeId)) fail("SCOPE_INVALID");
  if (![input.employees, input.profiles, input.sourceRecords].every(Array.isArray)) fail("INPUT_INVALID");
  return contract;
}
function indexEmployees(rows, scope) {
  const result = new Map();
  for (const row of rows) {
    exact(row, ["id", "tenantId", "parkId", "isDeleted", "sourceIdentitySha256"], "EMPLOYEE_INVALID");
    if (!UUID.test(row.id ?? "") || typeof row.isDeleted !== "boolean" || !validHash(row.sourceIdentitySha256)) fail("EMPLOYEE_INVALID");
    if (row.tenantId !== scope.tenantId || row.parkId !== scope.parkId) fail("FOREIGN_EMPLOYEE_SCOPE");
    if (row.isDeleted) fail("DELETED_EMPLOYEE");
    if (result.has(row.id) || [...result.values()].some(value => value.sourceIdentitySha256 === row.sourceIdentitySha256)) fail("DUPLICATE_EMPLOYEE_IDENTITY");
    result.set(row.id, structuredClone(row));
  }
  return result;
}
function indexProfiles(rows, employees, scope) {
  const result = new Map(), profileIds = new Set(), employeeIds = new Set();
  for (const row of rows) {
    exact(row, ["id", "employeeId", "employeeSourceIdentitySha256", "tenantId", "parkId", "isDeleted", "sourceIdentitySha256", "nativePlace", "degree"], "PROFILE_INVALID");
    if (!UUID.test(row.id ?? "") || !UUID.test(row.employeeId ?? "") || typeof row.isDeleted !== "boolean" || !validHash(row.sourceIdentitySha256) || !validHash(row.employeeSourceIdentitySha256)) fail("PROFILE_INVALID");
    if (row.tenantId !== scope.tenantId || row.parkId !== scope.parkId) fail("FOREIGN_PROFILE_SCOPE");
    if (row.isDeleted) fail("DELETED_PROFILE");
    if (!employees.has(row.employeeId) || employees.get(row.employeeId).sourceIdentitySha256 !== row.employeeSourceIdentitySha256) fail("UNOWNED_PROFILE");
    for (const mapping of MAPPINGS) {
      const value = row[mapping.targetField];
      if (value !== null && !wellFormedText(value)) fail("PROFILE_VALUE_INVALID");
      if (typeof value === "string" && [...value].length > mapping.maxLength) fail("PROFILE_VALUE_TOO_LONG");
    }
    if (result.has(row.sourceIdentitySha256)) fail("DUPLICATE_PROFILE_IDENTITY");
    if (profileIds.has(row.id)) fail("DUPLICATE_PROFILE_ID");
    if (employeeIds.has(row.employeeId)) fail("MULTIPLE_PROFILES_PER_EMPLOYEE");
    profileIds.add(row.id); employeeIds.add(row.employeeId);
    result.set(row.sourceIdentitySha256, structuredClone(row));
  }
  return result;
}
function indexSources(rows) {
  const result = new Map();
  for (const row of rows) {
    exact(row, ["sourceIdentitySha256", "sourceRowSha256", "oldaddr", "edulevel"], "SOURCE_INVALID");
    if (!validHash(row.sourceIdentitySha256) || !validHash(row.sourceRowSha256)) fail("SOURCE_INVALID");
    for (const mapping of MAPPINGS) {
      const value = row[mapping.sourceField];
      if (value !== null && !wellFormedText(value)) fail("SOURCE_VALUE_INVALID");
      if (typeof value === "string" && [...value].length > mapping.sourceMaxLength) fail("SOURCE_VALUE_TOO_LONG");
    }
    if (result.has(row.sourceIdentitySha256)) fail("DUPLICATE_SOURCE_IDENTITY");
    result.set(row.sourceIdentitySha256, structuredClone(row));
  }
  return result;
}
function beforeHash(profile) {
  return digest("legacy-personnel-alias-before-v1", { id: profile.id, employeeId: profile.employeeId, employeeSourceIdentitySha256: profile.employeeSourceIdentitySha256, sourceIdentitySha256: profile.sourceIdentitySha256, nativePlace: profile.nativePlace, degree: profile.degree });
}

/** Produces no mutations. `privatePatch` contains values and must never be logged. */
export function buildLegacyPersonnelAliasBackfillPlan(input) {
  const contract = validateInput(input), scope = input.binding.targetScope;
  const employees = indexEmployees(input.employees, scope), profiles = indexProfiles(input.profiles, employees, scope), sources = indexSources(input.sourceRecords);
  if (profiles.size !== sources.size) fail("IDENTITY_SET_INCOMPLETE");
  const records = [];
  for (const sourceIdentitySha256 of [...profiles.keys()].sort()) {
    const profile = profiles.get(sourceIdentitySha256), source = sources.get(sourceIdentitySha256);
    if (!source) fail("IDENTITY_SET_INCOMPLETE");
    const changes = [], preservedDifferent = [], alreadyEqual = [];
    for (const mapping of MAPPINGS) {
      const sourceValue = source[mapping.sourceField], targetValue = profile[mapping.targetField];
      if (sourceValue === null || sourceValue === "") continue;
      if (targetValue === null) changes.push({ targetField: mapping.targetField, sourceField: mapping.sourceField, value: sourceValue });
      else if (targetValue === sourceValue) alreadyEqual.push(mapping.targetField);
      else preservedDifferent.push(mapping.targetField);
    }
    const beforeSha256 = beforeHash(profile);
    if (changes.length) records.push({ sourceIdentitySha256, sourceRowSha256: source.sourceRowSha256, employeeId: profile.employeeId, profileId: profile.id, beforeSha256, disposition: "FILL_NULL_ONLY", privatePatch: changes, preservedDifferentFields: preservedDifferent, alreadyEqualFields: alreadyEqual });
    else if (preservedDifferent.length) records.push({ sourceIdentitySha256, sourceRowSha256: source.sourceRowSha256, employeeId: profile.employeeId, profileId: profile.id, beforeSha256, disposition: "PRESERVED_MODERN_DIFFERENCE", preservedDifferentFields: preservedDifferent, alreadyEqualFields: alreadyEqual });
    else records.push({ sourceIdentitySha256, sourceRowSha256: source.sourceRowSha256, employeeId: profile.employeeId, profileId: profile.id, beforeSha256, disposition: alreadyEqual.length ? "ALREADY_EQUAL" : "NO_SOURCE_VALUE", alreadyEqualFields: alreadyEqual });
  }
  const countByDisposition = Object.fromEntries(["FILL_NULL_ONLY", "PRESERVED_MODERN_DIFFERENCE", "ALREADY_EQUAL", "NO_SOURCE_VALUE"].map(kind => [kind, records.filter(row => row.disposition === kind).length]));
  const profileInventorySha256 = digest("legacy-personnel-alias-profile-inventory-v1", records.map(row => ({ sourceIdentitySha256: row.sourceIdentitySha256, employeeId: row.employeeId, profileId: row.profileId, beforeSha256: row.beforeSha256 })));
  const employeeInventorySha256 = digest("legacy-personnel-alias-employee-inventory-v1", [...employees.values()].map(row => ({ id: row.id, sourceIdentitySha256: row.sourceIdentitySha256 })).sort((a, b) => a.id.localeCompare(b.id)));
  const planCore = { formatVersion: 1, artifactKind: "yuzhou_legacy_personnel_alias_fill_only_plan", productionImport: "HOLD", authorizationGranted: false, executionReachable: false, targetScope: structuredClone(scope), contractSha256: legacyPersonnelAliasPlanSha256(contract), codeSha256: input.binding.codeSha256, sourceSnapshotSha256: input.binding.sourceSnapshotSha256, sourceEvidenceSha256: input.binding.sourceEvidenceSha256, profileInventorySha256, employeeInventorySha256, countByDisposition, records };
  return deepFreeze({ ...planCore, planSha256: legacyPersonnelAliasPlanSha256(planCore), summary: { productionImport: "HOLD", authorizationGranted: false, totalProfiles: records.length, countByDisposition } });
}
