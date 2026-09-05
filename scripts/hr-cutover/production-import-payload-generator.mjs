import { createHash } from "node:crypto";

import {
  computeProductionImportPayloadBundleHash,
  computeProductionImportPayloadHash,
  computeProductionImportTargetScopeHash,
} from "./production-import-sealed-plan-lib.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL,
  computeProductionImportBusinessIdentityHash,
  computeProductionImportTargetCanonicalHash,
  deriveProductionImportTargetId,
  stableProductionImportCanonicalJson,
  validateProductionImportTargetModel,
} from "./production-import-target-model.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u;
const DATE = /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/u;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/u;
const FORBIDDEN_SECRET = /(?:password|passwd|token|secret|private[_-]?key|connection[_-]?string|insureaccount)/iu;
const FROZEN_ARTIFACT_KEYS = ["artifactSha256", "content"];
const DISPOSITION_OPTIONAL_KEYS = ["decisionAttestationSha256", "expectedTargetVersionBefore", "beforeImage", "quarantine"];

export class ProductionImportPayloadGenerationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportPayloadGenerationError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionImportPayloadGenerationError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const same = (left, right) => stableProductionImportCanonicalJson(left) === stableProductionImportCanonicalJson(right);

export const computeFrozenArtifactHash = content => sha256(`${stableProductionImportCanonicalJson(content)}\n`);

function exactKeys(value, required, optional, code, label) {
  if (!isPlainObject(value)) fail(code, `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !allowed.has(key))) fail(code, `${label} keys differ`);
}

function verifyEnvelope(envelope, label) {
  exactKeys(envelope, FROZEN_ARTIFACT_KEYS, [], "PRODUCTION_IMPORT_FROZEN_ARTIFACT_INVALID", label);
  if (!SHA256.test(envelope.artifactSha256 ?? "") || computeFrozenArtifactHash(envelope.content) !== envelope.artifactSha256) fail("PRODUCTION_IMPORT_FROZEN_ARTIFACT_HASH_MISMATCH", label);
  return envelope.content;
}

function scanJson(value, label) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID", `${label} JSON number must be a safe integer`);
    return;
  }
  if (Array.isArray(value)) return value.forEach((entry, index) => scanJson(entry, `${label}[${index}]`));
  if (!isPlainObject(value)) fail("PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID", `${label} must contain JSON values only`);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SECRET.test(key)) fail("PRODUCTION_IMPORT_TARGET_FIELD_DENIED", `${label}.${key} forbidden`);
    scanJson(child, `${label}.${key}`);
  }
}

function validDate(value) {
  if (!DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const actual = new Date(Date.UTC(year, month - 1, day));
  return actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day;
}

export function normalizeProductionImportTargetFields(targetTable, fields, rule, { partial = false } = {}) {
  if (!isPlainObject(fields)) fail("PRODUCTION_IMPORT_TARGET_FIELD_INVALID", `${targetTable}.targetFields must be an object`);
  for (const key of Object.keys(fields)) {
    if (!rule.fieldWhitelist.includes(key) || FORBIDDEN_SECRET.test(key)) fail("PRODUCTION_IMPORT_TARGET_FIELD_DENIED", `${targetTable}.${key}`);
  }
  if (!partial) for (const field of rule.requiredFields) if (!Object.hasOwn(fields, field) || fields[field] === null) fail("PRODUCTION_IMPORT_TARGET_FIELD_REQUIRED", `${targetTable}.${field}`);
  const normalized = {};
  for (const field of rule.fieldWhitelist) {
    if (!Object.hasOwn(fields, field)) {
      if (!partial) normalized[field] = null;
      continue;
    }
    const value = fields[field];
    if (value === null) {
      if (!rule.nullableFields.includes(field)) fail("PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID", `${targetTable}.${field} cannot be null`);
      normalized[field] = null;
      continue;
    }
    if (field === "legacy_file_reference") fail("PRODUCTION_IMPORT_TARGET_FIELD_DENIED", `${targetTable}.legacy_file_reference must remain null; use protected evidence metadata`);
    if (rule.integerFields.includes(field)) {
      if (!Number.isSafeInteger(value)) fail("PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID", `${targetTable}.${field} must be a safe integer`);
    } else if (rule.booleanFields.includes(field)) {
      if (typeof value !== "boolean") fail("PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID", `${targetTable}.${field} must be boolean`);
    } else if (rule.decimalStringFields.includes(field)) {
      if (typeof value !== "string" || !DECIMAL.test(value)) fail("PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID", `${targetTable}.${field} must be an exact decimal string`);
    } else if (rule.dateFields.includes(field)) {
      if (typeof value !== "string" || !validDate(value)) fail("PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID", `${targetTable}.${field} must be an ISO date`);
    } else if (rule.timestampFields.includes(field)) {
      // This historical column is timestamp WITHOUT time zone. Its writer reads
      // wall-clock milliseconds, not an instant. Accept that exact representation
      // without inventing an offset; other timestamp fields retain their contract.
      const localContractSignature = targetTable === "hr_contract_change" && field === "signed_at"
        && typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/u.test(value)
        && Number.isFinite(Date.parse(`${value}Z`)) && new Date(`${value}Z`).toISOString() === `${value}Z`;
      if (!localContractSignature && (typeof value !== "string" || !TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value)))) fail("PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID", `${targetTable}.${field} must be an ISO timestamp`);
    } else if (rule.jsonObjectFields.includes(field)) {
      if (!isPlainObject(value)) fail("PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID", `${targetTable}.${field} must be a JSON object`);
      scanJson(value, `${targetTable}.${field}`);
    } else if (typeof value !== "string") {
      fail("PRODUCTION_IMPORT_TARGET_FIELD_TYPE_INVALID", `${targetTable}.${field} must be a string`);
    }
    normalized[field] = structuredClone(value);
  }
  return normalized;
}

const normalizeTargetFields = normalizeProductionImportTargetFields;

function validateTargetScope(targetScope) {
  exactKeys(targetScope, ["tenantId", "parkId", "scopeSha256"], [], "PRODUCTION_IMPORT_SEALED_SCOPE_INVALID", "targetScope");
  if (typeof targetScope.tenantId !== "string" || typeof targetScope.parkId !== "string" || !SHA256.test(targetScope.scopeSha256 ?? "") || targetScope.scopeSha256 !== computeProductionImportTargetScopeHash(targetScope)) fail("PRODUCTION_IMPORT_SEALED_SCOPE_INVALID", "target scope hash differs");
}

function validateFrozenArtifacts(input, model) {
  exactKeys(input, ["stagingArtifact", "decisionsArtifact", "targetInventoryArtifact", "sealedScopeArtifact"], [], "PRODUCTION_IMPORT_GENERATOR_INPUT_INVALID", "generatorInput");
  const staging = verifyEnvelope(input.stagingArtifact, "stagingArtifact");
  const decisions = verifyEnvelope(input.decisionsArtifact, "decisionsArtifact");
  const inventory = verifyEnvelope(input.targetInventoryArtifact, "targetInventoryArtifact");
  const sealedScope = verifyEnvelope(input.sealedScopeArtifact, "sealedScopeArtifact");
  exactKeys(sealedScope, ["formatVersion", "artifactKind", "targetScope"], [], "PRODUCTION_IMPORT_SEALED_SCOPE_INVALID", "sealedScope");
  if (sealedScope.formatVersion !== 1 || sealedScope.artifactKind !== "yuzhou_hr_production_import_sealed_scope") fail("PRODUCTION_IMPORT_SEALED_SCOPE_INVALID", "sealed scope identity invalid");
  validateTargetScope(sealedScope.targetScope);
  exactKeys(staging, ["formatVersion", "artifactKind", "sourceSnapshotHash", "records"], [], "PRODUCTION_IMPORT_FROZEN_STAGING_INVALID", "staging");
  if (staging.formatVersion !== 1 || staging.artifactKind !== "yuzhou_hr_production_import_frozen_staging_index" || !SHA256.test(staging.sourceSnapshotHash ?? "") || !Array.isArray(staging.records)) fail("PRODUCTION_IMPORT_FROZEN_STAGING_INVALID", "staging identity invalid");
  exactKeys(inventory, ["formatVersion", "artifactKind", "targetScope", "records"], [], "PRODUCTION_IMPORT_TARGET_INVENTORY_INVALID", "inventory");
  if (inventory.formatVersion !== 1 || inventory.artifactKind !== "yuzhou_hr_production_import_frozen_target_inventory" || !Array.isArray(inventory.records)) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_INVALID", "inventory identity invalid");
  validateTargetScope(inventory.targetScope);
  if (!same(inventory.targetScope, sealedScope.targetScope)) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_INVALID", "inventory scope differs from sealed scope");
  exactKeys(decisions, ["formatVersion", "artifactKind", "stagingArtifactSha256", "targetInventoryArtifactSha256", "sealedScopeArtifactSha256", "phaseManifests", "records"], [], "PRODUCTION_IMPORT_FROZEN_DECISIONS_INVALID", "decisions");
  if (decisions.formatVersion !== 1 || decisions.artifactKind !== "yuzhou_hr_production_import_frozen_decisions" || !Array.isArray(decisions.records) || decisions.stagingArtifactSha256 !== input.stagingArtifact.artifactSha256 || decisions.targetInventoryArtifactSha256 !== input.targetInventoryArtifact.artifactSha256 || decisions.sealedScopeArtifactSha256 !== input.sealedScopeArtifact.artifactSha256) fail("PRODUCTION_IMPORT_FROZEN_DECISIONS_INVALID", "decision artifact bindings differ");
  exactKeys(decisions.phaseManifests, model.phaseOrder, [], "PRODUCTION_IMPORT_FROZEN_DECISIONS_INVALID", "phaseManifests");
  for (const value of Object.values(decisions.phaseManifests)) if (!SHA256.test(value ?? "")) fail("PRODUCTION_IMPORT_FROZEN_DECISIONS_INVALID", "phase manifest hash invalid");
  return { staging, decisions, inventory, targetScope: sealedScope.targetScope };
}

function validateStaging(staging, model) {
  const staged = new Map();
  const identities = new Set();
  for (const [index, record] of staging.records.entries()) {
    exactKeys(record, ["phase", "targetTable", "sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256"], [], "PRODUCTION_IMPORT_FROZEN_STAGING_INVALID", `staging.records[${index}]`);
    const rule = model.targetTables[record.targetTable];
    if (!rule || record.phase !== rule.phase) fail("PRODUCTION_IMPORT_TARGET_TABLE_DENIED", `${record.phase}.${record.targetTable}`);
    if (record.sourceSystem !== model.sourceSystem || !rule.allowedSourceTables.includes(record.sourceTable) || !SHA256.test(record.sourceIdentitySha256 ?? "") || !SHA256.test(record.sourceRowSha256 ?? "") || record.sourcePkCanonical !== `sha256:${record.sourceIdentitySha256}`) fail("PRODUCTION_IMPORT_SOURCE_PROVENANCE_INVALID", `${record.phase}.${record.targetTable}`);
    const key = `${record.phase}:${record.sourceIdentitySha256}`;
    if (staged.has(key) || identities.has(record.sourceIdentitySha256)) fail("PRODUCTION_IMPORT_FROZEN_STAGING_INVALID", `duplicate source identity ${record.sourceIdentitySha256}`);
    staged.set(key, structuredClone(record));
    identities.add(record.sourceIdentitySha256);
  }
  return staged;
}

function validateInventory(inventory, model) {
  const records = new Map();
  const ids = new Set();
  for (const [index, row] of inventory.records.entries()) {
    exactKeys(row, ["targetTable", "businessIdentitySha256", "targetId", "targetCanonicalSha256", "targetVersion"], [], "PRODUCTION_IMPORT_TARGET_INVENTORY_INVALID", `inventory.records[${index}]`);
    if (!model.targetTables[row.targetTable] || !SHA256.test(row.businessIdentitySha256 ?? "") || !UUID.test(row.targetId ?? "") || !SHA256.test(row.targetCanonicalSha256 ?? "") || !Number.isSafeInteger(row.targetVersion) || row.targetVersion < 0) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_INVALID", `inventory.records[${index}] invalid`);
    const key = `${row.targetTable}:${row.businessIdentitySha256}`;
    if (records.has(key) || ids.has(`${row.targetTable}:${row.targetId}`)) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_INVALID", `inventory duplicate ${key}`);
    records.set(key, structuredClone(row));
    ids.add(`${row.targetTable}:${row.targetId}`);
  }
  return records;
}

function sortedDecisions(decisions, model) {
  const indexed = new Map();
  for (const [index, row] of decisions.records.entries()) {
    exactKeys(row, ["phase", "targetTable", "sourceIdentitySha256", "disposition", "targetFields", "dependencyRefs"], DISPOSITION_OPTIONAL_KEYS, "PRODUCTION_IMPORT_FROZEN_DECISIONS_INVALID", `decisions.records[${index}]`);
    if (!Array.isArray(row.dependencyRefs)) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${row.targetTable}.dependencyRefs must be an array`);
    const key = `${row.phase}:${row.sourceIdentitySha256}`;
    if (indexed.has(key)) fail("PRODUCTION_IMPORT_FROZEN_DECISIONS_INVALID", `duplicate ${key}`);
    indexed.set(key, structuredClone(row));
  }
  for (const row of indexed.values()) for (const reference of row.dependencyRefs) if (!indexed.has(`${reference.phase}:${reference.sourceIdentitySha256}`)) fail("PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED", `${row.targetTable}.${reference.role ?? "unknown"}`);
  const emitted = new Set();
  const result = [];
  while (result.length < indexed.size) {
    const ready = [...indexed.entries()].filter(([key, row]) => !emitted.has(key) && row.dependencyRefs.every(reference => emitted.has(`${reference.phase}:${reference.sourceIdentitySha256}`)));
    ready.sort((left, right) => model.phaseOrder.indexOf(left[1].phase) - model.phaseOrder.indexOf(right[1].phase) || left[1].sourceIdentitySha256.localeCompare(right[1].sourceIdentitySha256));
    if (ready.length === 0) fail("PRODUCTION_IMPORT_DEPENDENCY_CYCLE", "decision graph has a cycle or missing predecessor");
    for (const [key, row] of ready) { emitted.add(key); result.push(row); }
  }
  return result;
}

function dependencyProjection(decision, rule, generatedBySource, model) {
  if (!Array.isArray(decision.dependencyRefs)) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${decision.targetTable}.dependencyRefs`);
  const refsByRole = new Map();
  const derivedFields = {};
  for (const [index, ref] of decision.dependencyRefs.entries()) {
    exactKeys(ref, ["role", "phase", "sourceIdentitySha256", "expectedTargetTable"], [], "PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${decision.targetTable}.dependencyRefs[${index}]`);
    if (refsByRole.has(ref.role)) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${decision.targetTable}.${ref.role} duplicate`);
    const spec = rule.foreignKeys.find(candidate => candidate.dependencyRole === ref.role);
    const resolved = generatedBySource.get(`${ref.phase}:${ref.sourceIdentitySha256}`);
    const dependencyRule = model.targetTables[ref.expectedTargetTable];
    if (!spec || spec.targetTable !== ref.expectedTargetTable || !dependencyRule || dependencyRule.phase !== ref.phase || model.phaseOrder.indexOf(ref.phase) > model.phaseOrder.indexOf(decision.phase)) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${decision.targetTable}.${ref.role}`);
    if (!resolved || resolved.targetTable !== ref.expectedTargetTable) fail("PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED", `${decision.targetTable}.${ref.role}`);
    if (decision.disposition !== "quarantine" && resolved.disposition === "quarantine") fail("PRODUCTION_IMPORT_DEPENDENCY_RECORD_MAP_REQUIRED", `${decision.targetTable}.${ref.role} quarantined`);
    refsByRole.set(ref.role, ref);
    if (resolved.targetId) derivedFields[spec.column] = resolved.targetId;
  }
  for (const spec of rule.foreignKeys) if (spec.required && !refsByRole.has(spec.dependencyRole)) fail("PRODUCTION_IMPORT_DEPENDENCY_REQUIRED", `${decision.targetTable}.${spec.dependencyRole}`);
  if ([...refsByRole.keys()].some(role => !rule.foreignKeys.some(spec => spec.dependencyRole === role))) fail("PRODUCTION_IMPORT_DEPENDENCY_INVALID", `${decision.targetTable} undeclared role`);
  return { dependencyRefs: structuredClone(decision.dependencyRefs), derivedFields };
}

function buildPlanRecord(decision, staged, payload, derivedFields, targetScope, inventory, model) {
  const rule = model.targetTables[decision.targetTable];
  if (!rule.allowedDispositions.includes(decision.disposition)) fail("PRODUCTION_IMPORT_DISPOSITION_INVALID", `${decision.targetTable}.${decision.disposition}`);
  const base = {
    sourceSystem: staged.sourceSystem,
    sourceTable: staged.sourceTable,
    sourcePkCanonical: staged.sourcePkCanonical,
    sourceIdentitySha256: staged.sourceIdentitySha256,
    sourceRowSha256: staged.sourceRowSha256,
    payloadSha256: computeProductionImportPayloadHash(payload),
    plannedTargetTable: decision.targetTable,
    dependencyMode: rule.foreignKeys.length === 0 ? "scope" : rule.foreignKeys.length === 1 && rule.foreignKeys[0].dependencyRole === "employee" ? "employee" : "record_graph",
    dependencyRefs: structuredClone(decision.dependencyRefs),
    disposition: decision.disposition,
  };
  if (["merge", "quarantine", "skip_approved"].includes(decision.disposition)) {
    if (!SHA256.test(decision.decisionAttestationSha256 ?? "")) fail("PRODUCTION_IMPORT_DECISION_REQUIRED", `${decision.targetTable}.${decision.disposition}`);
    base.decisionAttestationSha256 = decision.decisionAttestationSha256;
  }
  const forbiddenOption = decision.disposition === "insert"
    ? ["decisionAttestationSha256", "expectedTargetVersionBefore", "beforeImage", "quarantine"].find(key => Object.hasOwn(decision, key))
    : decision.disposition === "merge"
      ? ["quarantine"].find(key => Object.hasOwn(decision, key))
      : decision.disposition === "skip_approved"
        ? ["beforeImage", "quarantine"].find(key => Object.hasOwn(decision, key))
        : ["expectedTargetVersionBefore", "beforeImage"].find(key => Object.hasOwn(decision, key));
  if (forbiddenOption) fail("PRODUCTION_IMPORT_DECISION_INVALID", `${decision.targetTable}.${forbiddenOption} not allowed for ${decision.disposition}`);
  if (decision.disposition === "quarantine") {
    exactKeys(decision.quarantine, ["reasonCode", "algorithm", "payloadCiphertextSha256", "keyReferenceSha256"], [], "PRODUCTION_IMPORT_QUARANTINE_INVALID", `${decision.targetTable}.quarantine`);
    if (!/^[A-Z][A-Z0-9_]{2,63}$/u.test(decision.quarantine.reasonCode ?? "") || decision.quarantine.algorithm !== "aes-256-gcm-external-kek-v1" || !SHA256.test(decision.quarantine.payloadCiphertextSha256 ?? "") || !SHA256.test(decision.quarantine.keyReferenceSha256 ?? "")) fail("PRODUCTION_IMPORT_QUARANTINE_INVALID", `${decision.targetTable}.quarantine invalid`);
    base.quarantine = structuredClone(decision.quarantine);
    return base;
  }
  const businessIdentitySha256 = computeProductionImportBusinessIdentityHash(decision.targetTable, targetScope, payload, derivedFields, model);
  const existing = inventory.get(`${decision.targetTable}:${businessIdentitySha256}`);
  const after = computeProductionImportTargetCanonicalHash(decision.targetTable, targetScope, payload, derivedFields, model);
  if (decision.disposition === "insert") {
    if (existing) fail("PRODUCTION_IMPORT_TARGET_COLLISION", `${decision.targetTable}.${businessIdentitySha256}`);
    base.targetId = deriveProductionImportTargetId({ targetScope, targetTable: decision.targetTable, sourceIdentitySha256: decision.sourceIdentitySha256 }, model);
    base.targetVersionAfter = 1;
  } else {
    if (!existing) fail("PRODUCTION_IMPORT_TARGET_INVENTORY_MATCH_REQUIRED", `${decision.targetTable}.${businessIdentitySha256}`);
    if (!Number.isSafeInteger(decision.expectedTargetVersionBefore) || decision.expectedTargetVersionBefore < 0 || decision.expectedTargetVersionBefore !== existing.targetVersion) fail("PRODUCTION_IMPORT_TARGET_VERSION_PRECONDITION_FAILED", `${decision.targetTable} target version differs from frozen inventory`);
    base.targetId = existing.targetId;
    base.expectedTargetBeforeSha256 = existing.targetCanonicalSha256;
    base.expectedTargetVersionBefore = existing.targetVersion;
  }
  base.targetTable = decision.targetTable;
  base.expectedTargetAfterSha256 = after;
  base.businessIdentitySha256 = businessIdentitySha256;
  if (decision.disposition === "skip_approved" && after !== existing.targetCanonicalSha256) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED", `${decision.targetTable} skip differs`);
  if (decision.disposition === "skip_approved") base.targetVersionAfter = existing.targetVersion;
  if (decision.disposition === "merge") {
    exactKeys(decision.beforeImage, ["algorithm", "plaintextSha256", "ciphertextSha256", "keyReferenceSha256"], [], "PRODUCTION_IMPORT_BEFORE_IMAGE_INVALID", `${decision.targetTable}.beforeImage`);
    if (decision.beforeImage.algorithm !== "aes-256-gcm-external-kek-v1" || !SHA256.test(decision.beforeImage.ciphertextSha256 ?? "") || !SHA256.test(decision.beforeImage.keyReferenceSha256 ?? "") || decision.beforeImage.plaintextSha256 !== existing.targetCanonicalSha256) fail("PRODUCTION_IMPORT_CAS_PRECONDITION_FAILED", `${decision.targetTable} before image differs`);
    if (existing.targetVersion === Number.MAX_SAFE_INTEGER) fail("PRODUCTION_IMPORT_TARGET_VERSION_OVERFLOW", `${decision.targetTable} cannot increment target version safely`);
    base.targetVersionAfter = existing.targetVersion + 1;
    base.beforeImage = structuredClone(decision.beforeImage);
  }
  return base;
}

export function generateProductionImportPayloads(input, { model: modelInput = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL } = {}) {
  const model = validateProductionImportTargetModel(modelInput);
  const { staging, decisions, inventory, targetScope } = validateFrozenArtifacts(input, model);
  const stagedBySource = validateStaging(staging, model);
  const inventoryByBusinessIdentity = validateInventory(inventory, model);
  const generatedBySource = new Map();
  const plannedBusinessIdentities = new Set();
  const plannedTargetIds = new Set([...inventoryByBusinessIdentity.values()].map(row => `${row.targetTable}:${row.targetId}`));
  const phaseRows = new Map(model.phaseOrder.map(phase => [phase, []]));
  for (const decision of sortedDecisions(decisions, model)) {
    const rule = model.targetTables[decision.targetTable];
    if (!rule || decision.phase !== rule.phase || !SHA256.test(decision.sourceIdentitySha256 ?? "")) fail("PRODUCTION_IMPORT_TARGET_TABLE_DENIED", `${decision.phase}.${decision.targetTable}`);
    const staged = stagedBySource.get(`${decision.phase}:${decision.sourceIdentitySha256}`);
    if (!staged || staged.targetTable !== decision.targetTable) fail("PRODUCTION_IMPORT_STAGED_SOURCE_REQUIRED", `${decision.phase}.${decision.sourceIdentitySha256}`);
    const payload = normalizeTargetFields(decision.targetTable, decision.targetFields, rule, { partial: decision.disposition === "quarantine" });
    const { derivedFields } = dependencyProjection(decision, rule, generatedBySource, model);
    const planRecord = buildPlanRecord(decision, staged, payload, derivedFields, targetScope, inventoryByBusinessIdentity, model);
    if (planRecord.businessIdentitySha256) {
      const businessKey = `${decision.targetTable}:${planRecord.businessIdentitySha256}`;
      const targetKey = `${decision.targetTable}:${planRecord.targetId}`;
      if (plannedBusinessIdentities.has(businessKey)) fail("PRODUCTION_IMPORT_TARGET_MAP_DUPLICATE", businessKey);
      if (decision.disposition === "insert" && plannedTargetIds.has(targetKey)) fail("PRODUCTION_IMPORT_TARGET_MAP_DUPLICATE", targetKey);
      plannedBusinessIdentities.add(businessKey);
      plannedTargetIds.add(targetKey);
    }
    const generated = { phase: decision.phase, targetTable: decision.targetTable, targetId: planRecord.targetId, disposition: decision.disposition, payload, planRecord };
    generatedBySource.set(`${decision.phase}:${decision.sourceIdentitySha256}`, generated);
    phaseRows.get(decision.phase).push(generated);
  }
  if (generatedBySource.size !== stagedBySource.size) fail("PRODUCTION_IMPORT_DECISION_COVERAGE_MISMATCH", `staged=${stagedBySource.size} decided=${generatedBySource.size}`);
  const bundles = [];
  const planPhases = [];
  for (const [ordinal, phase] of model.phaseOrder.entries()) {
    const rows = phaseRows.get(phase);
    const bundle = {
      formatVersion: 2,
      artifactKind: "yuzhou_hr_production_import_payload_bundle",
      phase,
      targetScope: structuredClone(targetScope),
      canonicalizationVersion: model.canonicalizationVersion,
      sourceBatchManifestSha256: decisions.phaseManifests[phase],
      records: rows.map(row => ({ sourceIdentitySha256: row.planRecord.sourceIdentitySha256, sourceRowSha256: row.planRecord.sourceRowSha256, targetTable: row.targetTable, payloadSha256: row.planRecord.payloadSha256, payload: structuredClone(row.payload) })),
    };
    const artifactText = `${stableProductionImportCanonicalJson(bundle)}\n`;
    bundles.push({ phase, bundle, payloadBundleSha256: computeProductionImportPayloadBundleHash(bundle), payloadBundleArtifactSha256: sha256(artifactText), artifactText });
    planPhases.push({ phase, ordinal, sourceBatchManifestSha256: decisions.phaseManifests[phase], records: rows.map(row => structuredClone(row.planRecord)) });
  }
  return {
    formatVersion: 1,
    generatorKind: "yuzhou_hr_production_import_payload_generation_result",
    targetModelVersion: model.modelVersion,
    targetScope: structuredClone(targetScope),
    phaseOrder: [...model.phaseOrder],
    sourceArtifacts: {
      stagingArtifactSha256: input.stagingArtifact.artifactSha256,
      decisionsArtifactSha256: input.decisionsArtifact.artifactSha256,
      targetInventoryArtifactSha256: input.targetInventoryArtifact.artifactSha256,
      sealedScopeArtifactSha256: input.sealedScopeArtifact.artifactSha256,
    },
    bundles,
    planPhases,
  };
}
