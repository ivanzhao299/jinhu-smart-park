import { createHash } from "node:crypto";
import { projectProductionT2Fields, verifyProductionT2StagedRecord, ProductionT2ProjectionError } from "./production-t2-field-projection.mjs";
import { validateProductionT0DecisionInventory } from "./materialize-production-t0-decision-candidates.mjs";
import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";
import { normalizeProductionImportTargetFields } from "./production-import-payload-generator.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, stableProductionImportCanonicalJson as canonical,
  computeProductionImportBusinessIdentityHash as businessHash,
  computeProductionImportTargetCanonicalHash as targetHash, deriveProductionImportTargetId as deriveId,
} from "./production-import-target-model.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const SHA = /^[0-9a-f]{64}$/u;
const tables = ["hr_contract_type", "hr_contract", "hr_contract_change", "hr_contract_legacy_evidence"];
const sourceTargets = { "dbo.compacttypecode": tables[0], "dbo.compact": tables[1], "dbo.compact_c": tables[2] };
const accepted = row => row && ["insert", "skip_exact"].includes(row.candidateDisposition);
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const dispositions = ["insert", "skip_exact", "review_target_collision", "quarantine"];
const provenanceKeys = ["phase", "targetTable", "sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256"];
const rowKeys = [...provenanceKeys, "candidateDisposition", "reasonCode", "targetFields", "dependencyRefs", "businessIdentitySha256", "expectedTargetId", "expectedTargetVersion", "expectedTargetCanonicalSha256"];
const fail = code => { throw new ProductionT2CandidatesError(code); };
export class ProductionT2CandidatesError extends Error {
  constructor(code) { super(code); this.name = "ProductionT2CandidatesError"; this.code = code; }
}
function exact(value, keys, code) {
  if (!plain(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code);
}
function same(a, b) {
  try { return canonical(a) === canonical(b); } catch { return false; }
}
function provenance(row, table = sourceTargets[row.sourceTable], identity = row.sourceIdentitySha256) {
  return { phase: "T2", targetTable: table, sourceSystem: "yuzhou-v10", sourceTable: row.sourceTable, sourcePkCanonical: `sha256:${identity}`, sourceIdentitySha256: identity, sourceRowSha256: row.sourceRowSha256 };
}
function metadata(row) {
  const result = [provenance(row)];
  if (row.sourceTable === "dbo.compact") {
    for (const [field, kind] of [["legacyTextPresent", "controlled_text"], ["legacyFilePresent", "file_manifest"]]) {
      if (![0, 1].includes(row.source[field])) fail("T2_CANDIDATE_EVIDENCE_PRESENCE_INVALID");
      if (row.source[field] === 1) result.push(provenance(row, tables[3], hash(`yuzhou-hr-production-source-projection-v1\0${row.sourceIdentitySha256}\0${tables[3]}\0${kind}`)));
    }
  }
  return result;
}
function blocked(row, reasonCode, refs = []) {
  return { ...row, candidateDisposition: "quarantine", reasonCode, targetFields: null, dependencyRefs: refs,
    businessIdentitySha256: null, expectedTargetId: null, expectedTargetVersion: null, expectedTargetCanonicalSha256: null };
}
function link(role, row) {
  return { role, phase: row.phase, sourceIdentitySha256: row.sourceIdentitySha256, expectedTargetTable: row.targetTable };
}
function validateT0(value, triple, scope, inventory, inventoryHash) {
  exact(value, ["formatVersion", "artifactKind", "triple", "phaseArtifactSha256", "targetInventoryArtifactSha256", "targetIdentitySha256", "targetScope", "jobStateDecisionArtifactSha256", "status", "countByDisposition", "records", "productionImport"], "T2_CANDIDATE_T0_INVALID");
  if (value.formatVersion !== 1 || value.artifactKind !== "yuzhou_hr_production_import_real_t0_decision_candidates" || value.productionImport !== "HOLD"
    || !same(value.triple, triple) || !same(value.targetScope, scope) || value.targetIdentitySha256 !== inventory.targetIdentitySha256
    || value.targetInventoryArtifactSha256 !== inventoryHash || !SHA.test(value.phaseArtifactSha256 ?? "") || !SHA.test(value.jobStateDecisionArtifactSha256 ?? "")
    || !Array.isArray(value.records)) fail("T2_CANDIDATE_T0_BINDING_INVALID");
  const rows = new Map(), counts = Object.fromEntries(dispositions.map(key => [key, 0]));
  for (const row of value.records) {
    exact(row, rowKeys, "T2_CANDIDATE_T0_INVALID");
    const rule = model.targetTables[row.targetTable];
    if (row.phase !== "T0" || rule?.phase !== "T0" || !rule.allowedSourceTables.includes(row.sourceTable) || row.sourceSystem !== "yuzhou-v10"
      || !SHA.test(row.sourceIdentitySha256 ?? "") || !SHA.test(row.sourceRowSha256 ?? "") || row.sourcePkCanonical !== `sha256:${row.sourceIdentitySha256}`
      || !dispositions.includes(row.candidateDisposition) || !Array.isArray(row.dependencyRefs) || rows.has(row.sourceIdentitySha256)) fail("T2_CANDIDATE_T0_INVALID");
    rows.set(row.sourceIdentitySha256, row); counts[row.candidateDisposition]++;
  }
  if (!same(counts, value.countByDisposition) || value.status !== (counts.quarantine + counts.review_target_collision === 0 ? "READY_FOR_FREEZE" : "REVIEW_HOLD")) fail("T2_CANDIDATE_T0_INVALID");
  const targets = new Map(inventory.records.map(row => [`${row.targetTable}:${row.businessIdentitySha256}`, row]));
  const targetIds = new Map(inventory.records.map(row => [`${row.targetTable}:${row.targetId}`, row]));
  const visiting = new Set(), verified = new Set(), business = new Set(), ids = new Set();
  function verify(row) {
    if (!accepted(row) || verified.has(row.sourceIdentitySha256)) return;
    if (visiting.has(row.sourceIdentitySha256)) fail("T2_CANDIDATE_T0_DEPENDENCY_INVALID");
    visiting.add(row.sourceIdentitySha256);
    const rule = model.targetTables[row.targetTable], derived = {}, roles = new Set();
    for (const ref of row.dependencyRefs) {
      exact(ref, ["role", "phase", "sourceIdentitySha256", "expectedTargetTable"], "T2_CANDIDATE_T0_DEPENDENCY_INVALID");
      const fk = rule.foreignKeys.find(item => item.dependencyRole === ref.role), parent = rows.get(ref.sourceIdentitySha256);
      if (!fk || roles.has(ref.role) || ref.phase !== "T0" || ref.expectedTargetTable !== fk.targetTable || parent?.targetTable !== fk.targetTable || !accepted(parent)) fail("T2_CANDIDATE_T0_DEPENDENCY_INVALID");
      verify(parent); roles.add(ref.role); derived[fk.column] = parent.expectedTargetId;
    }
    if (rule.foreignKeys.some(fk => fk.required && !roles.has(fk.dependencyRole))) fail("T2_CANDIDATE_T0_DEPENDENCY_INVALID");
    let fields;
    try { fields = normalizeProductionImportTargetFields(row.targetTable, row.targetFields, rule); }
    catch { fail("T2_CANDIDATE_T0_FIELDS_INVALID"); }
    const sourceCodeField = { sys_org: "org_code", hr_position: "position_code", hr_employee: "employee_code" }[row.targetTable];
    if (row.sourceIdentitySha256 !== hash(`${row.sourceTable}\0${fields[sourceCodeField]}`) || row.reasonCode !== null) fail("T2_CANDIDATE_T0_TARGET_INVALID");
    const businessIdentity = businessHash(row.targetTable, scope, fields, derived), key = `${row.targetTable}:${businessIdentity}`;
    const existing = targets.get(key), identity = row.expectedTargetId;
    if (row.businessIdentitySha256 !== businessIdentity || business.has(key) || ids.has(`${row.targetTable}:${identity}`)) fail("T2_CANDIDATE_T0_TARGET_INVALID");
    if (row.candidateDisposition === "insert") {
      if (existing || targetIds.has(`${row.targetTable}:${identity}`) || identity !== deriveId({ targetScope: scope, targetTable: row.targetTable, sourceIdentitySha256: row.sourceIdentitySha256 })
        || row.expectedTargetVersion !== null || row.expectedTargetCanonicalSha256 !== null) fail("T2_CANDIDATE_T0_TARGET_INVALID");
    } else if (!existing || identity !== existing.targetId || row.expectedTargetVersion !== existing.targetVersion || row.expectedTargetCanonicalSha256 !== existing.targetCanonicalSha256
      || targetHash(row.targetTable, scope, fields, derived) !== existing.targetCanonicalSha256) fail("T2_CANDIDATE_T0_TARGET_INVALID");
    business.add(key); ids.add(`${row.targetTable}:${identity}`); visiting.delete(row.sourceIdentitySha256); verified.add(row.sourceIdentitySha256);
  }
  for (const row of rows.values()) verify(row);
  return rows;
}

/** In-memory private-materializer core. Input hashes are references, NOT proof of bytes/authenticity/approval. */
export function assembleProductionT2DecisionCandidates(input) {
  exact(input, ["triple", "targetScope", "targetInventory", "t0Candidates", "phaseArtifact", "stagedRecords", "resolutions", "artifactHashes"], "T2_CANDIDATE_INPUT_INVALID");
  const { triple, targetScope: scope, targetInventory: inventory, t0Candidates, phaseArtifact: phase, stagedRecords, resolutions, artifactHashes } = input;
  exact(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "T2_CANDIDATE_TRIPLE_INVALID");
  if (!/^[0-9a-f]{40}$/u.test(triple.codeSha ?? "") || !SHA.test(triple.sourceSnapshotHash ?? "") || !SHA.test(triple.mappingContractHash ?? "")) fail("T2_CANDIDATE_TRIPLE_INVALID");
  exact(scope, ["tenantId", "parkId", "scopeSha256"], "T2_CANDIDATE_SCOPE_INVALID");
  if (![scope.tenantId, scope.parkId].every(value => typeof value === "string" && value.trim() === value && value.length > 0)
    || scope.scopeSha256 !== computeProductionImportTargetScopeHash(scope)) fail("T2_CANDIDATE_SCOPE_INVALID");
  exact(artifactHashes, ["phaseArtifactSha256", "targetInventoryArtifactSha256", "t0CandidatesArtifactSha256", "resolutionArtifactSha256"], "T2_CANDIDATE_BINDINGS_INVALID");
  if (Object.values(artifactHashes).some(value => typeof value !== "string" || !SHA.test(value))) fail("T2_CANDIDATE_BINDINGS_INVALID");
  try { validateProductionT0DecisionInventory(inventory, triple); } catch { fail("T2_CANDIDATE_INVENTORY_INVALID"); }
  if (inventory.kind !== "yuzhou_hr_production_target_inventory_readonly" || inventory.targetScopeSha256 !== scope.scopeSha256) fail("T2_CANDIDATE_INVENTORY_INVALID");
  const t0 = validateT0(t0Candidates, triple, scope, inventory, artifactHashes.targetInventoryArtifactSha256);
  exact(phase, ["formatVersion", "artifactKind", "triple", "phase", "targetTableCounts", "records"], "T2_CANDIDATE_PHASE_INVALID");
  exact(phase.targetTableCounts, tables, "T2_CANDIDATE_PHASE_INVALID");
  if (phase.formatVersion !== 1 || phase.artifactKind !== "yuzhou_hr_production_import_real_phase_staging" || phase.phase !== "T2" || !same(phase.triple, triple)
    || !Array.isArray(phase.records) || !Array.isArray(stagedRecords) || !Array.isArray(resolutions)) fail("T2_CANDIDATE_PHASE_INVALID");
  const sources = new Map(), meta = new Map(), sourceMeta = new Map(), counts = Object.fromEntries(tables.map(table => [table, 0]));
  for (const row of stagedRecords) {
    try { verifyProductionT2StagedRecord(row); } catch { fail("T2_CANDIDATE_SOURCE_INVALID"); }
    if (sources.has(row.sourceIdentitySha256)) fail("T2_CANDIDATE_SOURCE_DUPLICATE");
    sources.set(row.sourceIdentitySha256, row);
    const projected = metadata(row); sourceMeta.set(row.sourceIdentitySha256, projected);
    for (const item of projected) { if (meta.has(item.sourceIdentitySha256)) fail("T2_CANDIDATE_SOURCE_DUPLICATE"); meta.set(item.sourceIdentitySha256, item); counts[item.targetTable]++; }
  }
  const remaining = new Map(meta);
  for (const row of phase.records) {
    exact(row, provenanceKeys, "T2_CANDIDATE_PHASE_INVALID");
    const expected = remaining.get(row.sourceIdentitySha256);
    if (!expected || !same(row, expected)) fail("T2_CANDIDATE_PHASE_COVERAGE_INVALID");
    remaining.delete(row.sourceIdentitySha256);
  }
  if (remaining.size || !same(counts, phase.targetTableCounts)) fail("T2_CANDIDATE_PHASE_COVERAGE_INVALID");
  const decisions = new Map();
  for (const row of resolutions) {
    exact(row, ["sourceIdentitySha256", "resolved"], "T2_CANDIDATE_RESOLUTION_INVALID");
    if (!sources.has(row.sourceIdentitySha256) || decisions.has(row.sourceIdentitySha256)) fail("T2_CANDIDATE_RESOLUTION_INVALID");
    decisions.set(row.sourceIdentitySha256, row.resolved);
  }
  if (decisions.size !== sources.size) fail("T2_CANDIDATE_RESOLUTION_INVALID");
  const projected = new Map(), errors = new Map();
  for (const row of sources.values()) {
    try { for (const item of projectProductionT2Fields(row, decisions.get(row.sourceIdentitySha256))) projected.set(item.sourceIdentitySha256, item); }
    catch (error) {
      if (!(error instanceof ProductionT2ProjectionError)) fail("T2_CANDIDATE_PROJECTION_FAILED");
      for (const item of sourceMeta.get(row.sourceIdentitySha256)) errors.set(item.sourceIdentitySha256, error.code);
    }
  }
  const targetRows = new Map(inventory.records.map(row => [`${row.targetTable}:${row.businessIdentitySha256}`, row]));
  const targetIds = new Set(inventory.records.map(row => `${row.targetTable}:${row.targetId}`));
  const result = new Map(), byTypeName = new Map(), contracts = new Map(), owners = new Map();
  function create(item, parents, reason) {
    const refs = parents.filter(([, parent]) => parent).map(([role, parent]) => link(role, parent));
    if (errors.has(item.sourceIdentitySha256)) return blocked(item, errors.get(item.sourceIdentitySha256), refs);
    if (reason || parents.some(([, parent]) => !accepted(parent))) return blocked(item, reason ?? "T2_PARENT_REQUIRES_REVIEW", refs);
    const fields = projected.get(item.sourceIdentitySha256)?.targetFields;
    if (!fields) fail("T2_CANDIDATE_PROJECTION_FAILED");
    const rule = model.targetTables[item.targetTable], derived = {};
    for (const fk of rule.foreignKeys) {
      const parent = parents.find(([role]) => role === fk.dependencyRole)?.[1];
      if (!parent && fk.required) fail("T2_CANDIDATE_DEPENDENCY_INVALID");
      derived[fk.column] = parent?.expectedTargetId ?? null;
    }
    const business = businessHash(item.targetTable, scope, fields, derived), existing = targetRows.get(`${item.targetTable}:${business}`);
    const id = existing?.targetId ?? deriveId({ targetScope: scope, targetTable: item.targetTable, sourceIdentitySha256: item.sourceIdentitySha256 });
    if (!existing && targetIds.has(`${item.targetTable}:${id}`)) return blocked(item, "T2_TARGET_ID_COLLISION", refs);
    const exactTarget = existing && existing.targetCanonicalSha256 === targetHash(item.targetTable, scope, fields, derived);
    return { ...item, candidateDisposition: !existing ? "insert" : exactTarget ? "skip_exact" : "review_target_collision",
      reasonCode: existing && !exactTarget ? "TARGET_CANONICAL_MISMATCH" : null, targetFields: fields, dependencyRefs: refs,
      businessIdentitySha256: business, expectedTargetId: id, expectedTargetVersion: existing?.targetVersion ?? null,
      expectedTargetCanonicalSha256: existing?.targetCanonicalSha256 ?? null };
  }
  function completeLevel(rows) {
    const businesses = new Map(), ids = new Map();
    for (const row of rows) {
      if (row.businessIdentitySha256 === null) continue;
      for (const [index, key] of [[businesses, row.businessIdentitySha256], [ids, row.expectedTargetId]]) {
        if (!index.has(key)) index.set(key, []); index.get(key).push(row);
      }
    }
    const duplicates = new Set([...businesses.values(), ...ids.values()].filter(group => group.length > 1).flat().map(row => row.sourceIdentitySha256));
    for (const row of rows) result.set(row.sourceIdentitySha256, duplicates.has(row.sourceIdentitySha256)
      ? blocked(Object.fromEntries(provenanceKeys.map(key => [key, row[key]])), "T2_SOURCE_BUSINESS_COLLISION", row.dependencyRefs) : row);
  }
  const ordered = [...sources.values()].sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
  completeLevel(ordered.filter(row => row.sourceTable === "dbo.compacttypecode").map(row => create(meta.get(row.sourceIdentitySha256), [], null)));
  for (const row of ordered.filter(row => row.sourceTable === "dbo.compacttypecode")) {
    const name = String(row.source.typeName ?? "").trim();
    if (!byTypeName.has(name)) byTypeName.set(name, []); byTypeName.get(name).push(result.get(row.sourceIdentitySha256));
  }
  completeLevel(ordered.filter(row => row.sourceTable === "dbo.compact").map(row => {
    const employee = t0.get(hash(`dbo.person\0${row.source.employeeCode.trim()}`)), types = byTypeName.get(String(row.source.typeName ?? "").trim()) ?? [];
    return create(meta.get(row.sourceIdentitySha256), [["employee", employee?.targetTable === "hr_employee" ? employee : null], ["contract_type", types.length === 1 ? types[0] : null]],
      types.length > 1 ? "T2_CONTRACT_TYPE_AMBIGUOUS" : types.length === 0 ? "T2_CONTRACT_TYPE_MISSING" : !employee ? "T2_EMPLOYEE_MISSING" : null);
  }));
  for (const row of ordered.filter(row => row.sourceTable === "dbo.compact")) {
    contracts.set(row.source.contractNo.trim(), result.get(row.sourceIdentitySha256)); owners.set(row.source.contractNo.trim(), row.source.employeeCode.trim());
  }
  completeLevel(ordered.filter(row => row.sourceTable === "dbo.compact_c").map(row => {
    const parent = contracts.get(row.source.contractNo.trim());
    return create(meta.get(row.sourceIdentitySha256), [["contract", parent]], !parent ? "T2_CONTRACT_MISSING"
      : owners.get(row.source.contractNo.trim()) !== row.source.employeeCode.trim() ? "T2_CONTRACT_OWNER_MISMATCH" : null);
  }));
  completeLevel(ordered.filter(row => row.sourceTable === "dbo.compact").flatMap(row => sourceMeta.get(row.sourceIdentitySha256).slice(1).map(item => create(item, [["contract", result.get(row.sourceIdentitySha256)]], null))));
  const records = [...result.values()].sort((a, b) => tables.indexOf(a.targetTable) - tables.indexOf(b.targetTable) || a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
  if (records.length !== meta.size) fail("T2_CANDIDATE_OUTPUT_COVERAGE_INVALID");
  const countByDisposition = Object.fromEntries(dispositions.map(kind => [kind, records.filter(row => row.candidateDisposition === kind).length]));
  return structuredClone({ formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t2_decision_candidates", triple,
    ...artifactHashes, sourceManifestSha256: inventory.sourceManifestSha256, targetIdentitySha256: inventory.targetIdentitySha256, targetScope: scope,
    status: countByDisposition.quarantine + countByDisposition.review_target_collision === 0 ? "READY_FOR_REVIEW" : "REVIEW_HOLD",
    targetTableCounts: counts, countByDisposition, records, productionImport: "HOLD" });
}
