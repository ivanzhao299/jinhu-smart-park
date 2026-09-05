import { buildProductionT3AttendanceSupport, projectProductionT3Fields, verifyProductionT3StagedRecord } from "./production-t3-field-projection.mjs";
import { recoverProductionT3LegacyPolicy, ProductionT3PolicyRecoveryError } from "./production-t3-policy-recovery.mjs";
import { validateProductionT0CandidateDependencies, ProductionT2CandidatesError } from "./production-t2-decision-candidates.mjs";
import { validateProductionT0DecisionInventory } from "./materialize-production-t0-decision-candidates.mjs";
import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";
import { hashProductionT3ArtifactJson } from "./production-t3-artifact-json.mjs";
import {
  DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model,
  computeProductionImportBusinessIdentityHash as businessHash,
  computeProductionImportTargetCanonicalHash as targetHash, deriveProductionImportTargetId as deriveId,
} from "./production-import-target-model.mjs";

const SHA = /^[0-9a-f]{64}$/u;
const tables = Object.keys(model.targetTables).filter(table => model.targetTables[table].phase === "T3");
const provenanceKeys = ["phase", "targetTable", "sourceSystem", "sourceTable", "sourcePkCanonical", "sourceIdentitySha256", "sourceRowSha256"];
const dispositions = ["insert", "skip_exact", "review_target_collision", "quarantine"];
const accepted = row => row && ["insert", "skip_exact"].includes(row.candidateDisposition);
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const provenance = row => Object.fromEntries(provenanceKeys.map(key => [key, row[key]]));
export class ProductionT3CandidatesError extends Error {
  constructor(code) { super(code); this.name = "ProductionT3CandidatesError"; this.code = code; }
}
const fail = code => { throw new ProductionT3CandidatesError(code); };
function exact(value, keys, code) {
  if (!plain(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code);
}
function blocked(row, reasonCode) {
  return { ...provenance(row), candidateDisposition: "quarantine", reasonCode, targetFields: null,
    dependencyRefs: row.dependencyRefs, businessIdentitySha256: null, expectedTargetId: null,
    expectedTargetVersion: null, expectedTargetCanonicalSha256: null };
}

/** Pure review assembly. Hash references do not authenticate private input bytes,
 * the source manifest, the live target, or execution permission. */
export function assembleProductionT3DecisionCandidates(input) {
  exact(input, ["triple", "targetScope", "targetInventory", "t0Candidates", "stagedRecords", "attendanceFileSha256", "artifactHashes"], "T3_CANDIDATE_INPUT_INVALID");
  const { triple, targetScope: scope, targetInventory: inventory, t0Candidates, stagedRecords, attendanceFileSha256, artifactHashes } = input;
  exact(triple, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "T3_CANDIDATE_TRIPLE_INVALID");
  if (typeof triple.codeSha !== "string" || !/^[0-9a-f]{40}$/u.test(triple.codeSha)
    || ![triple.sourceSnapshotHash, triple.mappingContractHash].every(value => typeof value === "string" && SHA.test(value))) fail("T3_CANDIDATE_TRIPLE_INVALID");
  exact(scope, ["tenantId", "parkId", "scopeSha256"], "T3_CANDIDATE_SCOPE_INVALID");
  if (![scope.tenantId, scope.parkId].every(value => typeof value === "string" && value.trim() === value && value.length > 0)
    || scope.scopeSha256 !== computeProductionImportTargetScopeHash(scope)) fail("T3_CANDIDATE_SCOPE_INVALID");
  exact(artifactHashes, ["targetInventoryArtifactSha256", "t0CandidatesArtifactSha256"], "T3_CANDIDATE_BINDINGS_INVALID");
  if (Object.values(artifactHashes).some(value => typeof value !== "string" || !SHA.test(value))
    || typeof attendanceFileSha256 !== "string" || !SHA.test(attendanceFileSha256)) fail("T3_CANDIDATE_BINDINGS_INVALID");
  if (!Array.isArray(stagedRecords)) fail("T3_CANDIDATE_SOURCE_INVALID");
  try { validateProductionT0DecisionInventory(inventory, triple); } catch { fail("T3_CANDIDATE_INVENTORY_INVALID"); }
  if (inventory.kind !== "yuzhou_hr_production_target_inventory_readonly" || inventory.targetScopeSha256 !== scope.scopeSha256) fail("T3_CANDIDATE_INVENTORY_INVALID");
  let t0;
  try { t0 = validateProductionT0CandidateDependencies(t0Candidates, triple, scope, inventory, artifactHashes.targetInventoryArtifactSha256); }
  catch (error) { fail(error instanceof ProductionT2CandidatesError ? error.code.replace(/^T2_/u, "T3_") : "T3_CANDIDATE_T0_INVALID"); }

  // Keep only source references and one expansion per parent. Do not clone the
  // large source/projection/candidate arrays at the return boundary.
  const identities = new Set(), attendance = [], byTable = new Map(tables.map(table => [table, []]));
  const policyRecoveries = [];
  function add(item) {
    if (!byTable.has(item.targetTable) || identities.has(item.sourceIdentitySha256)) fail("T3_CANDIDATE_SOURCE_DUPLICATE");
    identities.add(item.sourceIdentitySha256); byTable.get(item.targetTable).push(item);
  }
  for (const row of stagedRecords) {
    try { verifyProductionT3StagedRecord(row); } catch { fail("T3_CANDIDATE_SOURCE_INVALID"); }
    let normalized = row;
    // Any old-layout item invokes the strict complete-layout recovery check;
    // a mixed or partial policy must never pass as an already-current policy.
    if (row.sourceTable === "dbo.insure_method" && row.items.some(item => !Object.hasOwn(item, "baseFixedAmount"))) {
      let recovery;
      try { recovery = recoverProductionT3LegacyPolicy(row); }
      catch (error) { fail(error instanceof ProductionT3PolicyRecoveryError ? error.code : "T3_CANDIDATE_POLICY_RECOVERY_INVALID"); }
      normalized = recovery.normalizedRecord;
      policyRecoveries.push({ proof: recovery.proof, lineage: recovery.lineage });
    }
    if (row.sourceTable === "dbo.timekeeptable") attendance.push(row);
    let projections;
    try { projections = projectProductionT3Fields(normalized, { attendanceFileSha256 }); }
    catch { fail("T3_CANDIDATE_PROJECTION_FAILED"); }
    for (const item of projections) add(item);
  }
  let support;
  try { support = buildProductionT3AttendanceSupport(attendance, attendanceFileSha256); }
  catch { fail("T3_CANDIDATE_SOURCE_INVALID"); }
  for (const item of support) add(item);
  policyRecoveries.sort((a, b) => a.proof.sourceIdentitySha256.localeCompare(b.proof.sourceIdentitySha256));

  const targetRows = new Map(inventory.records.map(row => [`${row.targetTable}:${row.businessIdentitySha256}`, row]));
  const targetIds = new Set(inventory.records.map(row => `${row.targetTable}:${row.targetId}`));
  const result = new Map(), records = [], phaseRecords = [];
  const counts = Object.fromEntries(tables.map(table => [table, 0]));
  const countByDisposition = Object.fromEntries(dispositions.map(disposition => [disposition, 0]));
  function create(item) {
    // Semantic projector failures keep their original reason and identity even
    // when an ancestor is also unresolved.
    if (item.reasonCode !== null) return blocked(item, item.reasonCode);
    if (!item.targetFields) fail("T3_CANDIDATE_PROJECTION_FAILED");
    const rule = model.targetTables[item.targetTable], derived = {}, roles = new Set();
    let parentReason = null;
    for (const ref of item.dependencyRefs) {
      const fk = rule.foreignKeys.find(fk => fk.dependencyRole === ref.role);
      if (!fk || roles.has(ref.role) || ref.expectedTargetTable !== fk.targetTable
        || ref.phase !== model.targetTables[fk.targetTable].phase) fail("T3_CANDIDATE_DEPENDENCY_INVALID");
      roles.add(ref.role);
      const parent = (ref.phase === "T0" ? t0 : result).get(ref.sourceIdentitySha256);
      if (!parent || parent.targetTable !== fk.targetTable) parentReason ??= ref.phase === "T0" ? "T3_EMPLOYEE_MISSING" : "T3_PARENT_MISSING";
      else if (!accepted(parent)) parentReason ??= "T3_PARENT_REQUIRES_REVIEW";
      derived[fk.column] = parent?.expectedTargetId ?? null;
    }
    for (const fk of rule.foreignKeys) if (!roles.has(fk.dependencyRole)) {
      if (fk.required) parentReason ??= fk.targetTable === "hr_employee" ? "T3_EMPLOYEE_MISSING" : "T3_PARENT_MISSING";
      derived[fk.column] = null;
    }
    if (parentReason) return blocked(item, parentReason);
    const business = businessHash(item.targetTable, scope, item.targetFields, derived);
    const existing = targetRows.get(`${item.targetTable}:${business}`);
    const id = existing?.targetId ?? deriveId({ targetScope: scope, targetTable: item.targetTable, sourceIdentitySha256: item.sourceIdentitySha256 });
    if (!existing && targetIds.has(`${item.targetTable}:${id}`)) return blocked(item, "T3_TARGET_ID_COLLISION");
    const exactTarget = existing && existing.targetCanonicalSha256 === targetHash(item.targetTable, scope, item.targetFields, derived);
    return { ...provenance(item), candidateDisposition: !existing ? "insert" : exactTarget ? "skip_exact" : "review_target_collision",
      reasonCode: existing && !exactTarget ? "TARGET_CANONICAL_MISMATCH" : null, targetFields: item.targetFields, dependencyRefs: item.dependencyRefs,
      businessIdentitySha256: business, expectedTargetId: id, expectedTargetVersion: existing?.targetVersion ?? null,
      expectedTargetCanonicalSha256: existing?.targetCanonicalSha256 ?? null };
  }
  const completedTables = new Set();
  for (const table of tables) {
    const rule = model.targetTables[table];
    if (rule.foreignKeys.some(fk => model.targetTables[fk.targetTable].phase !== "T0" && !completedTables.has(fk.targetTable))) fail("T3_CANDIDATE_MODEL_ORDER_INVALID");
    const projected = byTable.get(table).sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
    counts[table] = projected.length;
    const level = [], businesses = new Map(), ids = new Map(), duplicates = new Set();
    for (const item of projected) {
      phaseRecords.push(provenance(item));
      const row = create(item); level.push(row);
      if (row.businessIdentitySha256 === null) continue;
      for (const [index, key] of [[businesses, row.businessIdentitySha256], [ids, row.expectedTargetId]]) {
        if (index.has(key)) { duplicates.add(index.get(key)); duplicates.add(row.sourceIdentitySha256); }
        else index.set(key, row.sourceIdentitySha256);
      }
    }
    // Finalize every competing source before descendants can observe a parent.
    for (const row of level) {
      const final = duplicates.has(row.sourceIdentitySha256) ? blocked(row, "T3_SOURCE_BUSINESS_COLLISION") : row;
      result.set(final.sourceIdentitySha256, final); records.push(final); countByDisposition[final.candidateDisposition]++;
    }
    byTable.delete(table); completedTables.add(table);
  }
  if (records.length !== identities.size || phaseRecords.length !== records.length) fail("T3_CANDIDATE_OUTPUT_COVERAGE_INVALID");
  const phaseArtifact = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple: { ...triple }, phase: "T3", targetTableCounts: { ...counts }, records: phaseRecords };
  const candidates = { formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t3_decision_candidates", triple: { ...triple },
    ...artifactHashes, phaseArtifactSha256: hashProductionT3ArtifactJson(phaseArtifact), sourceManifestSha256: inventory.sourceManifestSha256,
    targetIdentitySha256: inventory.targetIdentitySha256, targetScope: { ...scope },
    status: countByDisposition.quarantine + countByDisposition.review_target_collision === 0 ? "READY_FOR_REVIEW" : "REVIEW_HOLD",
    targetTableCounts: counts, countByDisposition, records, productionImport: "HOLD" };
  return { phaseArtifact, candidates, policyRecoveries };
}
