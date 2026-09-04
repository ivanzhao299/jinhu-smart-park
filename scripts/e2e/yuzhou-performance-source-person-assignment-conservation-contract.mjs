import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = path => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read(
  "scripts/hr-cutover/contracts/legacy-performance-source-person-assignment-conservation-v1.json",
));
const migration305 = read("database/migrations/000305_hr_performance_yuzhou_legacy_relations.sql");
const migration306 = read("database/migrations/000306_hr_performance_yuzhou_identity_resolution.sql");
const service = read("apps/api/src/modules/hr/hr-performance-legacy-relations.service.ts");
const web = read("apps/web/app/hr/performance/HrPerformanceLegacyRelationsPanel.tsx");
const styles = read("apps/web/app/hr/performance/performance-legacy-relations.module.css");

test("safe source aggregate freezes all 117 relations without granting migration credit", () => {
  assert.equal(contract.formatVersion, 1);
  assert.equal(contract.sourceAggregate.sourceTable, "dbo.asssourperson");
  assert.deepEqual(contract.sourceAggregate, {
    sourceTable: "dbo.asssourperson",
    rowCount: 117,
    subjectNotFoundInSourcePersonRows: 108,
    blankAssessorRows: 117,
    distinctSessionCount: 1,
  });
  assert.equal(contract.compatibilityCredit, 0);
  assert.equal(contract.status, "SOURCE_AGGREGATE_BOUND_REAL_LOAD_NOT_EXECUTED");
  assert.equal(contract.productionImport, "HOLD");
  assert.match(contract.sourceFactLocationReceiptSha256, /^[0-9a-f]{64}$/u);
  assert.match(contract.sourceFactLocationCanonicalSha256, /^[0-9a-f]{64}$/u);
  assert.ok(contract.evidenceBoundary.syntheticRuntimeDoesNotProveRealSourceLoaded);
});

test("000305 preserves blank assessors and orphan-shaped subjects one-for-one", () => {
  assert.match(migration305, /CREATE TABLE hr_performance_legacy_source_person_assignment/u);
  assert.match(migration305, /source_person_code varchar\(10\)/u);
  assert.match(migration305, /source_assessor_code varchar\(50\)/u);
  assert.doesNotMatch(
    migration305,
    /source_(?:person|assessor)_code varchar\([^)]*\) NOT NULL/u,
  );
  assert.match(migration305, /v_row->>'person',v_row->>'assperson'/u);
  assert.match(migration305, /jsonb_array_length\(p_payload->'asssourperson'\)/u);
  assert.match(migration305, /HR_PERFORMANCE_LEGACY_RELATION_WRITER_CONSERVATION_FAILED/u);
  assert.match(migration305, /'dbo\.asssourperson','hr_performance_legacy_source_person_assignment'/u);
  assert.doesNotMatch(migration305, /REFERENCES hr_employee/u);
});

test("000306 creates separate subject and assessor outcomes without guessing", () => {
  assert.match(migration306, /CROSS JOIN \(VALUES\('subject'::varchar\),\('assessor'::varchar\)\)/u);
  assert.match(migration306, /2\*\(SELECT count\(\*\) FROM hr_performance_legacy_source_person_assignment/u);
  assert.match(migration306, /ASSESSOR_CODE_EMPTY/u);
  assert.match(migration306, /T0_PERSON_MAP_NOT_FOUND/u);
  assert.match(migration306, /v_person_status:='unmatched'/u);
  assert.match(migration306, /v_person_status:='not_applicable'/u);
  assert.match(migration306, /owner_t0_record_map_id IS NULL AND target_employee_id IS NULL/u);
});

test("API projection is stable, paginated and exposes statuses but no internal identity", () => {
  assert.match(service, /source_assignment_id ASC/u);
  assert.match(service, /LIMIT \$\$\{limitIndex\} OFFSET \$\$\{offsetIndex\}/u);
  assert.match(service, /person_role='subject'/u);
  assert.match(service, /person_role='assessor'/u);
  assert.match(service, /THEN 'blank'/u);
  for (const field of contract.queryContract.requiredFields) {
    assert.match(service, new RegExp(`${field}:`, "u"));
  }
  for (const field of contract.queryContract.forbiddenFields) {
    assert.doesNotMatch(service, new RegExp(`${field}:`, "u"));
  }
  assert.equal(Math.ceil(contract.sourceAggregate.rowCount / contract.queryContract.pageSize), 6);
});

test("desktop and 390px use cards with explicit unmatched and blank states", () => {
  assert.deepEqual(contract.webContract.viewports.map(viewport => viewport.width), [1440, 390]);
  assert.match(web, /被考核人映射状态/u);
  assert.match(web, /评分人映射状态/u);
  assert.match(web, /未找到现代员工映射，旧关系已保留/u);
  assert.match(web, /旧评分人为空，空值已原样保留/u);
  assert.match(web, /const PAGE_SIZE = 20/u);
  assert.match(web, /<article className=\{styles\.card\}/u);
  assert.doesNotMatch(web, /<table/u);
  assert.match(styles, /@media \(max-width: 560px\)/u);
  assert.match(styles, /\.fieldGrid\s*\{[\s\S]*grid-template-columns:\s*1fr/u);
  assert.doesNotMatch(styles, /overflow-x:\s*(?:auto|scroll)/u);
});

test("committed safe contract contains no source row, person value or secret field", () => {
  const serialized = JSON.stringify(contract);
  for (const forbidden of [
    "sourcePersonCodeValue",
    "sourceAssessorCodeValue",
    "personNameValue",
    "password",
    "credentialValue",
    "databaseUrl",
    "/Users/",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`"${forbidden}":`, "iu"));
  }
});
