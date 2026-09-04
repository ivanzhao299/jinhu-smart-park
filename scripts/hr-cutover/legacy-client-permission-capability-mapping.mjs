import { createHash } from "node:crypto";

export class LegacyClientPermissionCapabilityMappingError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyClientPermissionCapabilityMappingError";
    this.code = code;
  }
}

const EXPECTED_GRANT_EDGES = 915;
const SOURCE_ROW_KEYS = ["legacyUnitCode", "legacyDomain", "legacyResource", "legacyAction", "legacyScope", "targetDomain", "targetPermissions", "disposition", "reasonCode", "evidenceSha256"];
const SOURCE_RECEIPT_KEYS = ["formatVersion", "artifactKind", "sourceRestoreReceiptSha256", "databaseIdentitySha256", "queryIdentitySha256", "operationMode", "expectedAuthorizationGrantEdges", "safeFacts", "status", "compatibilityCredit", "containsUserBoundRows", "productionImport", "receiptSha256"];
const SOURCE_SAFE_FACT_KEYS = ["rightsRows", "templateRows", "usersRows", "rightsDistinctUnitcodes", "templateDistinctUnitcodes", "sharedUnitcodes", "capabilityUnionUnitcodes", "rightsOrphanUnitcodes", "templateUnusedUnitcodes", "duplicateGrantPrimaryKeys", "structuralConflictUnitcodes", "blankTemplateSemantics", "grantEdgeSetSha256", "capabilitySetSha256"];
const FORBIDDEN_FIELDS = ["username", "userId", "account", "accountId", "employeeId", "personId", "password", "credential", "token", "secret", "granted", "allowed", "assignedTo"];
const DISPOSITIONS = new Set(["exact_mapped", "split_mapped", "retired", "pending_review"]);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sha64 = value => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
const fail = (code, detail) => { throw new LegacyClientPermissionCapabilityMappingError(code, detail); };

function validateSourceInventory(sourceInventory) {
  if (sourceInventory?.formatVersion !== 1
    || sourceInventory.contractKind !== "yuzhou_hr_legacy_client_atomic_inventory"
    || sourceInventory.surface !== "client"
    || sourceInventory.productionImport !== "HOLD") fail("PERMISSION_SOURCE_INVENTORY_INVALID", "identity");
  if (sourceInventory.expectedCounts?.authorizationGrantEdges !== EXPECTED_GRANT_EDGES) {
    fail("PERMISSION_GRANT_EDGE_DENOMINATOR_DRIFT", String(sourceInventory.expectedCounts?.authorizationGrantEdges));
  }
  if (sourceInventory.status !== "skeleton_with_existing_evidence"
    || sourceInventory.unreviewedAtomicReason !== "CLIENT_ATOMIC_NAME_AND_TARGET_BINDING_NOT_REVIEWED") {
    fail("PERMISSION_SOURCE_INVENTORY_INVALID", "review state");
  }
}

function assertNoUserBoundFields(value, label) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUserBoundFields(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.some(forbidden => forbidden.toLowerCase() === key.toLowerCase())) {
      fail("PERMISSION_USER_BOUND_FIELD_FORBIDDEN", `${label}.${key}`);
    }
    assertNoUserBoundFields(item, `${label}.${key}`);
  }
}

function semanticText(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]{1,120}$/u.test(value)) fail("PERMISSION_SEMANTIC_VALUE_INVALID", label);
  return value;
}

function validateSourceReceipt(sourceReceipt) {
  if (sourceReceipt === undefined) return null;
  const { receiptSha256, ...body } = sourceReceipt ?? {};
  if (!exactKeys(sourceReceipt, SOURCE_RECEIPT_KEYS)
    || !exactKeys(sourceReceipt?.safeFacts, SOURCE_SAFE_FACT_KEYS)
    || sourceReceipt?.formatVersion !== 1
    || sourceReceipt.artifactKind !== "yuzhou_hr_legacy_client_permission_source_receipt"
    || sourceReceipt.expectedAuthorizationGrantEdges !== EXPECTED_GRANT_EDGES
    || sourceReceipt.containsUserBoundRows !== false
    || sourceReceipt.compatibilityCredit !== 0
    || sourceReceipt.productionImport !== "HOLD"
    || !sha64(receiptSha256)
    || sha256(`${JSON.stringify(body)}\n`) !== receiptSha256
    || !Number.isSafeInteger(sourceReceipt.safeFacts?.capabilityUnionUnitcodes)
    || sourceReceipt.safeFacts.capabilityUnionUnitcodes <= 0
    || sourceReceipt.safeFacts.rightsRows !== EXPECTED_GRANT_EDGES
    || !sha64(sourceReceipt.safeFacts.capabilitySetSha256)) fail("PERMISSION_SOURCE_RECEIPT_INVALID", "identity counts or hash binding");
  return sourceReceipt;
}

function normalizeSourceRow(row, modernPermissions, index) {
  assertNoUserBoundFields(row, `rows[${index}]`);
  if (!exactKeys(row, SOURCE_ROW_KEYS)) fail("PERMISSION_SOURCE_ROW_INVALID", `${index}:keys`);
  if (!Number.isSafeInteger(row.legacyUnitCode) || row.legacyUnitCode < 0) fail("PERMISSION_SOURCE_ROW_INVALID", `${index}:legacyUnitCode`);
  const legacyDomain = semanticText(row.legacyDomain, `${index}:legacyDomain`);
  const legacyResource = semanticText(row.legacyResource, `${index}:legacyResource`);
  const legacyAction = semanticText(row.legacyAction, `${index}:legacyAction`);
  const legacyScope = semanticText(row.legacyScope, `${index}:legacyScope`);
  if (!DISPOSITIONS.has(row.disposition)) fail("PERMISSION_DISPOSITION_INVALID", `${index}:${row.disposition}`);
  if (!Array.isArray(row.targetPermissions) || new Set(row.targetPermissions).size !== row.targetPermissions.length) fail("PERMISSION_TARGET_INVALID", `${index}:targetPermissions`);
  for (const permission of row.targetPermissions) {
    if (typeof permission !== "string" || !/^hr:[a-z0-9_]+(?::[a-z0-9_]+)*$/u.test(permission)) fail("PERMISSION_TARGET_INVALID", `${index}:permission`);
    if (modernPermissions && !modernPermissions.has(permission)) fail("PERMISSION_TARGET_UNKNOWN", permission);
  }
  const mapped = row.disposition === "exact_mapped" || row.disposition === "split_mapped";
  if (mapped || row.disposition === "retired") semanticText(row.targetDomain, `${index}:targetDomain`);
  else if (row.targetDomain !== null) fail("PERMISSION_TARGET_INVALID", `${index}:pending targetDomain`);
  if (row.disposition === "exact_mapped" && row.targetPermissions.length !== 1) fail("PERMISSION_TARGET_INVALID", `${index}:exact cardinality`);
  if (row.disposition === "split_mapped" && row.targetPermissions.length < 2) fail("PERMISSION_TARGET_INVALID", `${index}:split cardinality`);
  if (row.disposition === "retired" && row.targetPermissions.length !== 0) fail("PERMISSION_TARGET_INVALID", `${index}:retired permissions`);
  if (row.disposition === "pending_review" && row.targetPermissions.length !== 0) fail("PERMISSION_TARGET_INVALID", `${index}:pending permissions`);
  if (mapped && row.reasonCode !== null) fail("PERMISSION_REASON_INVALID", `${index}:mapped`);
  if (!mapped && !/^[A-Z][A-Z0-9_]+$/u.test(row.reasonCode ?? "")) fail("PERMISSION_REASON_INVALID", `${index}:unmapped`);
  if (!sha64(row.evidenceSha256)) fail("PERMISSION_EVIDENCE_INVALID", String(index));
  const semanticIdentity = { legacyUnitCode: row.legacyUnitCode, legacyDomain, legacyResource, legacyAction, legacyScope };
  return {
    id: `PERMISSION-${sha256(JSON.stringify(semanticIdentity)).slice(0, 16).toUpperCase()}`,
    ...semanticIdentity,
    targetDomain: row.targetDomain,
    targetPermissions: [...row.targetPermissions].sort(),
    disposition: row.disposition,
    reasonCode: row.reasonCode,
    evidenceSha256: row.evidenceSha256
  };
}

function baseReport(sourceInventory, sourceReceipt) {
  return {
    formatVersion: 1,
    contractKind: "yuzhou_hr_legacy_client_permission_capability_mapping",
    surface: "client",
    sourceInventorySha256: sha256(`${JSON.stringify(sourceInventory)}\n`),
    sourceReceiptSha256: sourceReceipt?.receiptSha256 ?? null,
    fixedDenominator: sourceReceipt?.safeFacts.capabilityUnionUnitcodes ?? null,
    authorizationGrantEdges: {
      observedRows: sourceReceipt?.safeFacts.rightsRows ?? 0,
      expectedRows: EXPECTED_GRANT_EDGES,
      compatibilityCredit: 0,
      status: sourceReceipt ? "SOURCE_GRANT_EDGE_CONSERVATION_VERIFIED" : "SOURCE_RECEIPT_MISSING",
    },
    inputContract: {
      kind: "explicit_redacted_structural_authorization_export",
      stableIdentityFields: ["legacyUnitCode", "legacyDomain", "legacyResource", "legacyAction", "legacyScope"],
      forbiddenFields: FORBIDDEN_FIELDS,
      policy: "capability_semantics_only_no_user_grant_replication"
    }
  };
}

export function buildLegacyClientPermissionCapabilityMapping(sourceInventory, sourceRows, { modernPermissions, sourceReceipt } = {}) {
  validateSourceInventory(sourceInventory);
  if (!Array.isArray(sourceRows)) fail("PERMISSION_SOURCE_ROWS_INVALID", "array required");
  if (modernPermissions !== undefined && !(modernPermissions instanceof Set)) fail("PERMISSION_TARGET_REGISTRY_INVALID", "Set required");
  const receipt = validateSourceReceipt(sourceReceipt);
  const base = baseReport(sourceInventory, receipt);
  if (!receipt) {
    if (sourceRows.length !== 0) fail("PERMISSION_SOURCE_RECEIPT_REQUIRED", "capability rows require a bound receipt");
    return {
      ...base,
      status: "SOURCE_PERMISSION_RECEIPT_MISSING",
      summary: { observedRows: 0, uniqueRows: 0, mappedRows: 0, retiredRows: 0, pendingRows: 0, missingRows: null },
      compatibilityCredit: { numerator: 0, denominator: null },
      items: [],
      gaps: [{ code: "LEGACY_CLIENT_PERMISSION_SOURCE_RECEIPT_MISSING", expectedRows: null, observedRows: 0, requiredInput: "readonly_permission_source_receipt" }],
      productionImport: "HOLD"
    };
  }
  const expectedCapabilities = receipt.safeFacts.capabilityUnionUnitcodes;
  if (sourceRows.length !== expectedCapabilities) fail("PERMISSION_SOURCE_ROW_COUNT_MISMATCH", `${sourceRows.length}/${expectedCapabilities}`);
  if (!(modernPermissions instanceof Set)) fail("PERMISSION_TARGET_REGISTRY_INVALID", "Set required for reviewed capability rows");
  const unitCodes = sourceRows.map(row => row?.legacyUnitCode);
  if (new Set(unitCodes).size !== expectedCapabilities) fail("PERMISSION_DUPLICATE_UNIT_CODE", "capability unitcode must be unique");
  const capabilitySetSha256 = sha256([...sourceRows]
    .map(row => row?.legacyUnitCode)
    .sort((left, right) => left - right)
    .map(unitcode => `${unitcode};`)
    .join(""));
  if (capabilitySetSha256 !== receipt.safeFacts.capabilitySetSha256) fail("PERMISSION_CAPABILITY_SET_HASH_MISMATCH", capabilitySetSha256);
  const items = sourceRows.map((row, index) => normalizeSourceRow(row, modernPermissions, index));
  const identities = new Set();
  for (const item of items) {
    if (identities.has(item.id)) fail("PERMISSION_DUPLICATE_SEMANTIC_IDENTITY", item.id);
    identities.add(item.id);
  }
  items.sort((left, right) => left.id.localeCompare(right.id, "en"));
  const mappedRows = items.filter(item => ["exact_mapped", "split_mapped"].includes(item.disposition)).length;
  const retiredRows = items.filter(item => item.disposition === "retired").length;
  const pendingRows = items.filter(item => item.disposition === "pending_review").length;
  return {
    ...base,
    status: pendingRows === 0 ? "ATOMIC_PERMISSION_MAPPING_COMPLETE" : "ATOMIC_PERMISSION_MAPPING_PENDING_REVIEW",
    summary: { observedRows: items.length, uniqueRows: identities.size, mappedRows, retiredRows, pendingRows, missingRows: 0 },
    compatibilityCredit: { numerator: mappedRows + retiredRows, denominator: expectedCapabilities },
    items,
    gaps: pendingRows === 0 ? [] : [{ code: "LEGACY_CLIENT_PERMISSION_TARGET_REVIEW_PENDING", expectedRows: expectedCapabilities, observedRows: items.length, requiredInput: "reviewed_modern_permission_binding" }],
    productionImport: "HOLD"
  };
}

export function verifyLegacyClientPermissionCapabilityMapping(sourceInventory, contract, options = {}) {
  const sourceRows = (contract?.items ?? []).map(item => {
    const row = { ...item };
    delete row.id;
    return row;
  });
  const rebuilt = buildLegacyClientPermissionCapabilityMapping(sourceInventory, sourceRows, options);
  if (JSON.stringify(contract) !== JSON.stringify(rebuilt)) fail("PERMISSION_MAPPING_CONTRACT_DRIFT", "checked contract differs from derived result");
  return rebuilt;
}
