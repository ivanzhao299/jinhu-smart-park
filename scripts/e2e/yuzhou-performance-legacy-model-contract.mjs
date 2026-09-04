import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(root, "database/migrations/000300_hr_performance_yuzhou_legacy_model.sql"),
  "utf8",
);

const tables = [
  "hr_performance_legacy_template_profile",
  "hr_performance_legacy_level_rule",
  "hr_performance_legacy_dimension_profile",
  "hr_performance_legacy_dimension_level_guide",
  "hr_performance_legacy_dimension_result",
];
for (const table of tables) {
  assert.match(migration, new RegExp(`CREATE TABLE ${table} \\(`));
  assert.match(migration, new RegExp(`REVOKE ALL ON ${table} FROM PUBLIC`));
}

const exactSourceColumns = {
  hr_performance_legacy_template_profile: [
    ["source_assessment", "integer NOT NULL"],
    ["source_assessment_name", "varchar\\(50\\)"],
    ["source_department", "varchar\\(30\\)"],
    ["source_m_percent", "integer"],
    ["source_t_percent", "integer"],
    ["source_x_percent", "integer"],
    ["source_c_percent", "integer"],
    ["source_s_percent", "integer"],
    ["source_timekeep", "boolean"],
    ["source_bonus", "boolean"],
    ["source_master", "boolean"],
  ],
  hr_performance_legacy_level_rule: [
    ["source_ass_grade", "varchar\\(12\\) NOT NULL"],
    ["source_description", "varchar\\(500\\)"],
    ["source_my_order", "varchar\\(2\\)"],
    ["source_assessment_id", "integer"],
    ["source_min_value", "integer"],
    ["source_max_value", "integer"],
  ],
  hr_performance_legacy_dimension_profile: [
    ["source_item_id", "integer NOT NULL"],
    ["source_assessment_id", "integer"],
    ["source_item_name", "varchar\\(100\\)"],
    ["source_full_value", "numeric\\(18,2\\)"],
    ["source_my_order", "integer"],
  ],
  hr_performance_legacy_dimension_level_guide: [
    ["source_guide_id", "integer NOT NULL"],
    ["source_item_id", "integer"],
    ["source_grade", "varchar\\(12\\)"],
    ["source_description", "varchar\\(500\\)"],
    ["source_min_value", "integer"],
    ["source_max_value", "integer"],
    ["source_my_order", "integer"],
  ],
  hr_performance_legacy_dimension_result: [
    ["source_detail_id", "integer NOT NULL"],
    ["source_session_id", "integer"],
    ["source_person_code", "varchar\\(10\\)"],
    ["source_item_id", "integer"],
    ["source_self_value", "numeric\\(18,2\\)"],
    ["source_m_item_value", "numeric\\(18,2\\)"],
    ["source_item_value", "numeric\\(18,2\\)"],
    ["source_x_item_value", "numeric\\(18,2\\)"],
    ["source_c_item_value", "numeric\\(18,2\\)"],
    ["source_self_grade", "varchar\\(12\\)"],
    ["source_ass_grade", "varchar\\(12\\)"],
    ["source_appraisal", "varchar\\(200\\)"],
  ],
};
assert.equal(Object.values(exactSourceColumns).flat().length, 41);
for (const [table, columns] of Object.entries(exactSourceColumns)) {
  const tableBlock = migration.match(new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
  assert.ok(tableBlock, `missing ${table} definition`);
  for (const [column, type] of columns) {
    assert.match(tableBlock, new RegExp(`\\b${column} ${type}[,\\n]`));
  }
}

for (const sourceTable of [
  "dbo.assessmentcode",
  "dbo.assgradecode",
  "dbo.assitem",
  "dbo.assitemgradedes",
  "dbo.assessmentdetail",
]) {
  assert.match(migration, new RegExp(`'${sourceTable.replace(".", "\\.")}'`));
}

assert.match(migration, /legacy_record_map_id uuid NOT NULL REFERENCES legacy_record_map\(id\) DEFERRABLE INITIALLY DEFERRED/g);
assert.match(migration, /HR_PERFORMANCE_LEGACY_RECORD_MAP_MISMATCH/);
assert.match(migration, /HR_PERFORMANCE_LEGACY_RECORD_MAP_COLLISION/);
assert.match(migration, /uq_hr_perf_version_parent_identity/);
assert.match(migration, /uq_hr_perf_dimension_parent_identity/);
assert.match(migration, /uq_hr_perf_level_parent_identity/);
assert.match(migration, /target_level_id,tenant_id,park_id,target_template_version_id/);
assert.match(migration, /target_dimension_id,tenant_id,park_id,target_template_version_id/);
assert.match(migration, /legacy_level_rule_id,tenant_id,park_id,migration_batch_id/);
assert.match(migration, /REFERENCES hr_performance_legacy_level_rule\(id,tenant_id,park_id,migration_batch_id\)/);
assert.match(migration, /HR_PERFORMANCE_LEGACY_FACT_APPEND_ONLY/);
assert.match(migration, /batch\.target_database=current_database\(\)/);
assert.match(migration, /batch\.phase='rollback'/);
assert.match(migration, /batch\.status='running'/);
assert.match(migration, /COALESCE\(sum\(result\.source_self_value\),0\) \* COALESCE\(template\.source_s_percent,0\) \/ 100::numeric/);
assert.match(migration, /source_m_item_value[\s\S]*source_m_percent/);
assert.match(migration, /source_item_value[\s\S]*source_t_percent/);
assert.match(migration, /source_x_item_value[\s\S]*source_x_percent/);
assert.match(migration, /source_c_item_value[\s\S]*source_c_percent/);
assert.doesNotMatch(migration, /source_(master|timekeep|bonus)_value/);
assert.match(migration, /master\/timekeeping\/bonus additions are intentionally excluded/);

console.log("Yuzhou performance legacy model contract passed (41/41 source fields structurally preserved).");
