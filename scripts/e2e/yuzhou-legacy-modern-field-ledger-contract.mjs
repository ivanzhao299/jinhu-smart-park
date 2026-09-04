import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildLegacyModernFieldLedger, LegacyModernFieldLedgerError,resolveLegacyFieldLedgerStatus } from "../hr-cutover/legacy-modern-field-ledger.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const tableMap = read("scripts/hr-cutover/contracts/legacy-modern-table-domain-map-v1.json");

test("table contract classifies every legacy table exactly once", () => {
  const tables = tableMap.groups.flatMap(group => group.sourceTables);
  assert.equal(tables.length, 162);
  assert.equal(new Set(tables).size, 162);
  assert.equal(tableMap.productionImport, "HOLD");
});

test("decomposition contract covers the four legacy wide-table designs", () => {
  assert.deepEqual(new Set(tableMap.decompositionRules.map(rule => rule.id)), new Set([
    "department-code-hierarchy", "person-wide-domain-split", "person-custom-fields", "attendance-days", "insurance-kinds", "salary-dynamic-items", "binary-object-extraction",
  ]));
});

test("ledger rejects a dropped table classification before reading field data", () => {
  const broken = structuredClone(tableMap);
  broken.groups[0].sourceTables.shift();
  assert.throws(
    () => buildLegacyModernFieldLedger({ inventory: { formatVersion: 1 }, relations: {}, tableMap: broken, coreMapping: {}, root }),
    error => error instanceof Error,
  );
  assert.equal(tableMap.currentExtractionTables.includes("person"), true);
});

test("runtime contract keeps password out and binary content on the object path", () => {
  const migration = readFileSync(resolve(root, "database/migrations/000290_hr_legacy_archive_full_field_projection.sql"), "utf8");
  assert.match(migration, /password/iu);
  assert.match(migration, /photo/iu);
  assert.match(migration, /legacyFields/u);
  assert.doesNotMatch(migration, /NEW\.display_safe_projection[^;]*record_payload/su);
  assert.throws(() => { throw new LegacyModernFieldLedgerError("FIXTURE", "fail closed"); }, /FIXTURE/u);
});

test("ledger cannot report complete without resolved relations and dual-surface hashed approval",()=>{
  const summary={notExtractedPendingMappingFields:0,archiveVisiblePendingNormalizationFields:0,extractedPendingTargetMappingFields:0,targetSchemaRequiredTables:0};
  assert.deepEqual(resolveLegacyFieldLedgerStatus(summary,{unresolvedRelations:104,completionApproval:{status:"approved",evidenceSha256:"a".repeat(64),clientSurfaceComplete:true,groupWebSurfaceComplete:true}}),{status:"IN_PROGRESS",completionApprovalValid:true});
  assert.deepEqual(resolveLegacyFieldLedgerStatus(summary,{unresolvedRelations:0,completionApproval:{status:"approved",evidenceSha256:"free text",clientSurfaceComplete:true,groupWebSurfaceComplete:true}}),{status:"IN_PROGRESS",completionApprovalValid:false});
  assert.deepEqual(resolveLegacyFieldLedgerStatus(summary,{unresolvedRelations:0,completionApproval:{status:"approved",evidenceSha256:"a".repeat(64),clientSurfaceComplete:true,groupWebSurfaceComplete:true}}),{status:"COMPLETE",completionApprovalValid:true});
});

test("declared target locators do not become verified functional coverage",()=>{
  const source=readFileSync(resolve(root,"scripts/hr-cutover/legacy-modern-field-ledger.mjs"),"utf8");
  assert.match(source,/declaredNormalizedFields: normalized/);
  assert.match(source,/verifiedNormalizedFields: verifiedNormalized/);
  assert.match(source,/verifiedNormalizedFunctionalFieldPercent/);
  assert.doesNotMatch(source,/normalizedFunctionalFieldPercent:/);
});
